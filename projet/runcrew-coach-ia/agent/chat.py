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


async def run_chat_stream(
    crew_id: str,
    question: str,
    utilisateur_id: str | None,
    jwt: str,
):
    """Reason -> act -> observe loop for the crew-chat @Kipper mention, yielding
    one event per step AS IT HAPPENS: {type: reasoning|tool_call|tool_result|final|error}.
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
                    yield {
                        "type": "error",
                        "message": "L'agent n'a pas appelé finaliser_reponse_chat",
                    }
                    return

                messages.append({"role": "assistant", "content": resp.content})

                for block in resp.content:
                    if block.type == "text" and block.text.strip():
                        yield {"type": "reasoning", "text": block.text.strip()}

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
                    yield {"type": "tool_call", "tool": block.name, "input": block.input}
                    try:
                        out = await session.call_tool(block.name, block.input)
                        text = "\n".join(c.text for c in out.content) or "(aucun résultat)"
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

                if finalize_id is not None:
                    if not reponse:
                        reponse = "Désolé, je n'ai pas pu formuler de réponse."
                    yield {"type": "tool_call", "tool": "finaliser_reponse_chat", "input": {"reponse": reponse}}
                    tool_results.append(
                        {"type": "tool_result", "tool_use_id": finalize_id, "content": "OK"}
                    )
                    messages.append({"role": "user", "content": tool_results})
                    yield {"type": "final", "result": reponse}
                    return

                if not tool_results:
                    for block in resp.content:
                        if block.type == "tool_use":
                            err_text = "Erreur: résultat manquant."
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": err_text,
                                "is_error": True,
                            })
                            yield {"type": "tool_result", "tool": block.name, "output": err_text, "is_error": True}

                messages.append({"role": "user", "content": tool_results})

            yield {"type": "error", "message": f"max_iters ({MAX_ITERS}) atteint sans finalisation"}


async def run_chat(crew_id: str, question: str, utilisateur_id: str | None, jwt: str) -> str:
    """Non-streaming wrapper around run_chat_stream. Behaviour unchanged for
    existing callers (/coach/chat without debug mode)."""
    async for event in run_chat_stream(crew_id, question, utilisateur_id, jwt):
        if event["type"] == "final":
            return event["result"]
        if event["type"] == "error":
            raise AgentDidNotFinalizeError(event["message"])
    raise AgentDidNotFinalizeError("Boucle terminée sans résultat")
