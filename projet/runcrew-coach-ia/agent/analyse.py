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


async def run_analyse(session_id: str, crew_id: str, jwt: str) -> dict:
    """Agent loop: fetches bilans, analyses patterns, posts to chat, returns structured results."""
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
                    raise AgentDidNotFinalizeError(
                        "L'agent a terminé sans appeler finaliser_analyse_seance"
                    )

                messages.append({"role": "assistant", "content": resp.content})

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
                    try:
                        out = await session.call_tool(block.name, block.input)
                        text = "\n".join(c.text for c in out.content)
                        tool_results.append(
                            {"type": "tool_result", "tool_use_id": block.id, "content": text}
                        )
                    except Exception as e:  # noqa: BLE001
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": f"Erreur: {e}",
                                "is_error": True,
                            }
                        )

                if analyse is not None:
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": finalize_block_id,
                            "content": "Analyse enregistrée.",
                        }
                    )
                    messages.append({"role": "user", "content": tool_results})
                    return analyse

                messages.append({"role": "user", "content": tool_results})

            raise AgentDidNotFinalizeError(f"max_iters ({MAX_ITERS}) atteint sans finalisation")
