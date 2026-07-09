import os
import sys
from datetime import date

import anthropic
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agent.finalize_chat import FINALIZE_CHAT_SCHEMA
from agent.skill_chat import CHAT_SYSTEM_PROMPT
from agent.loop import AgentDidNotFinalizeError

MODEL = "claude-haiku-4-5"
MAX_ITERS = 6

_client = anthropic.Anthropic()


async def run_chat(
    crew_id: str,
    question: str,
    utilisateur_id: str | None,
    jwt: str,
) -> str:
    """Agent loop: searches coaching KB, optionally checks runner history, returns response text.
    The Flask route is responsible for posting the response to the crew chat."""
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

            # Only expose the tools useful for answering a chat question
            ALLOWED = {"search_coaching_knowledge", "get_historique_runner", "get_meteo_prevision"}
            anthropic_tools = [
                {"name": t.name, "description": t.description, "input_schema": t.inputSchema}
                for t in mcp_tools.tools
                if t.name in ALLOWED
            ] + [FINALIZE_CHAT_SCHEMA]

            today = date.today().isoformat()
            user_content = f"crew_id: {crew_id}\n"
            user_content += f"date_du_jour: {today}\n"
            if utilisateur_id:
                user_content += f"utilisateur_id: {utilisateur_id}\n"
            user_content += f"Question @Kipper : {question}"

            messages = [{"role": "user", "content": user_content}]

            for _ in range(MAX_ITERS):
                resp = _client.messages.create(
                    model=MODEL,
                    max_tokens=1024,
                    system=CHAT_SYSTEM_PROMPT,
                    tools=anthropic_tools,
                    messages=messages,
                )

                if resp.stop_reason != "tool_use":
                    raise AgentDidNotFinalizeError(
                        "L'agent n'a pas appelé finaliser_reponse_chat"
                    )

                messages.append({"role": "assistant", "content": resp.content})

                tool_results = []
                reponse = None
                finalize_id = None

                for block in resp.content:
                    if block.type != "tool_use":
                        continue
                    if block.name == "finaliser_reponse_chat":
                        reponse = block.input.get("reponse") or ""
                        finalize_id = block.id
                        continue
                    try:
                        out = await session.call_tool(block.name, block.input)
                        text = "\n".join(c.text for c in out.content) or "(aucun résultat)"
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

                if finalize_id is not None:
                    if not reponse:
                        reponse = "Désolé, je n'ai pas pu formuler de réponse."
                    tool_results.append(
                        {"type": "tool_result", "tool_use_id": finalize_id, "content": "OK"}
                    )
                    messages.append({"role": "user", "content": tool_results})
                    return reponse

                if not tool_results:
                    for block in resp.content:
                        if block.type == "tool_use":
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": "Erreur: résultat manquant.",
                                "is_error": True,
                            })

                messages.append({"role": "user", "content": tool_results})

            raise AgentDidNotFinalizeError(f"max_iters ({MAX_ITERS}) atteint sans finalisation")
