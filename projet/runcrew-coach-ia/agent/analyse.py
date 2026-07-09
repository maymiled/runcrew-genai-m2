import os
import sys

import anthropic
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agent.finalize_analyse import FINALIZE_ANALYSE_SCHEMA
from agent.skill_analyse import ANALYSE_SYSTEM_PROMPT
from agent.loop import AgentDidNotFinalizeError

MODEL = "claude-haiku-4-5"
MAX_ITERS = 10

_client = anthropic.Anthropic()


async def run_analyse_stream(session_id: str, crew_id: str, jwt: str):
    """Reason -> act -> observe loop for the post-session analysis, yielding one
    event per step AS IT HAPPENS: {type: reasoning|tool_call|tool_result|final|error}.
    Same shape as agent.loop.run_agent_stream -- only the tools/skill/schema differ."""
    env = {**os.environ, "SUPABASE_JWT": jwt}
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "mcp_server.server"],
        env=env,
    )

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            mcp_tools = await session.list_tools()
            anthropic_tools = [
                {"name": t.name, "description": t.description, "input_schema": t.inputSchema}
                for t in mcp_tools.tools
            ] + [FINALIZE_ANALYSE_SCHEMA]

            messages = [
                {
                    "role": "user",
                    "content": (
                        f"session_id: {session_id}\n"
                        f"crew_id: {crew_id}\n"
                        "Analyse les bilans post-séance de ce crew."
                    ),
                }
            ]

            for _ in range(MAX_ITERS):
                resp = _client.messages.create(
                    model=MODEL,
                    max_tokens=4096,
                    system=ANALYSE_SYSTEM_PROMPT,
                    tools=anthropic_tools,
                    messages=messages,
                )

                if resp.stop_reason != "tool_use":
                    yield {
                        "type": "error",
                        "message": "L'agent a terminé sans appeler finaliser_analyse_seance",
                    }
                    return

                messages.append({"role": "assistant", "content": resp.content})

                for block in resp.content:
                    if block.type == "text" and block.text.strip():
                        yield {"type": "reasoning", "text": block.text.strip()}

                tool_results = []
                analyse = None
                finalize_block_id = None

                for block in resp.content:
                    if block.type != "tool_use":
                        continue
                    if block.name == "finaliser_analyse_seance":
                        analyse = block.input
                        finalize_block_id = block.id
                        continue
                    yield {"type": "tool_call", "tool": block.name, "input": block.input}
                    try:
                        out = await session.call_tool(block.name, block.input)
                        text = "\n".join(c.text for c in out.content)
                        tool_results.append(
                            {"type": "tool_result", "tool_use_id": block.id, "content": text}
                        )
                        yield {"type": "tool_result", "tool": block.name, "output": text, "is_error": False}
                    except Exception as e:  # noqa: BLE001
                        err_text = f"Erreur: {e}"
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": err_text,
                                "is_error": True,
                            }
                        )
                        yield {"type": "tool_result", "tool": block.name, "output": err_text, "is_error": True}

                if analyse is not None:
                    yield {"type": "tool_call", "tool": "finaliser_analyse_seance", "input": analyse}
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": finalize_block_id,
                            "content": "Analyse enregistrée.",
                        }
                    )
                    messages.append({"role": "user", "content": tool_results})
                    yield {"type": "final", "result": analyse}
                    return

                messages.append({"role": "user", "content": tool_results})

            yield {"type": "error", "message": f"max_iters ({MAX_ITERS}) atteint sans finalisation"}


async def run_analyse(session_id: str, crew_id: str, jwt: str) -> dict:
    """Non-streaming wrapper around run_analyse_stream. Behaviour unchanged for
    existing callers (/coach/analyse without debug mode)."""
    async for event in run_analyse_stream(session_id, crew_id, jwt):
        if event["type"] == "final":
            return event["result"]
        if event["type"] == "error":
            raise AgentDidNotFinalizeError(event["message"])
    raise AgentDidNotFinalizeError("Boucle terminée sans résultat")
