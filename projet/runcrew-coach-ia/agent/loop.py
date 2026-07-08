import os
import sys

import anthropic
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agent.finalize_tool import FINALIZE_TOOL_SCHEMA
from agent.skill import SYSTEM_PROMPT

MODEL = "claude-haiku-4-5"
MAX_ITERS = 6

_client = anthropic.Anthropic()  # lit ANTHROPIC_API_KEY depuis l'environnement


class AgentDidNotFinalizeError(Exception):
    pass


async def run_agent(crew_id: str, brief: str, jwt: str) -> dict:
    """Reason -> act -> observe loop. Spawns a fresh MCP server subprocess per
    call, with the captain's JWT injected via env so Claude never sees it."""
    env = {
        **os.environ,
        "SUPABASE_JWT": jwt,
    }
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
            ] + [FINALIZE_TOOL_SCHEMA]

            messages = [
                {
                    "role": "user",
                    "content": f"crew_id: {crew_id}\nBrief du capitaine: {brief}",
                }
            ]

            for _ in range(MAX_ITERS):
                resp = _client.messages.create(
                    model=MODEL,
                    max_tokens=4096,
                    system=SYSTEM_PROMPT,
                    tools=anthropic_tools,
                    messages=messages,
                )

                if resp.stop_reason != "tool_use":
                    raise AgentDidNotFinalizeError(
                        "Le modèle a terminé sans appeler finaliser_plan_session"
                    )

                messages.append({"role": "assistant", "content": resp.content})

                tool_results = []
                draft = None

                for block in resp.content:
                    if block.type != "tool_use":
                        continue
                    if block.name == "finaliser_plan_session":
                        draft = block.input
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

                if draft is not None:
                    return draft

                messages.append({"role": "user", "content": tool_results})

            raise AgentDidNotFinalizeError(f"max_iters ({MAX_ITERS}) atteint sans finalisation")
