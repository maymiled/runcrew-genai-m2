import os
import sys
from datetime import datetime

import anthropic
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from agent.finalize_tool import FINALIZE_TOOL_SCHEMA
from agent.skill import SYSTEM_PROMPT

MODEL = "claude-haiku-4-5"
MAX_ITERS = 6
TOLERANCE_MIN = 5

JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


def _aujourdhui_fr() -> str:
    now = datetime.now()
    return f"{JOURS_FR[now.weekday()]} {now.strftime('%Y-%m-%d')}"

_client = anthropic.Anthropic()  # lit ANTHROPIC_API_KEY depuis l'environnement


class AgentDidNotFinalizeError(Exception):
    pass


def _duration_mismatch(draft: dict):
    """Return (total, cible, ecart) if the déroulé's summed duree_min drifts from
    duree_entrainement_min by more than TOLERANCE_MIN, else None."""
    total = sum(e.get("duree_min", 0) for e in draft.get("deroulement", []))
    cible = draft.get("duree_entrainement_min", 0)
    ecart = total - cible
    if abs(ecart) > TOLERANCE_MIN:
        return total, cible, ecart
    return None


async def run_agent_stream(crew_id: str, brief: str, jwt: str):
    """Reason -> act -> observe loop, yielding one event per step AS IT HAPPENS —
    this is the debug-mode instrument: {type: reasoning|tool_call|tool_result|final|error}.
    Spawns a fresh MCP server subprocess per call, with the captain's JWT injected via
    env so Claude never sees it.
    """
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
                    "content": (
                        f"Nous sommes le {_aujourdhui_fr()}.\n"
                        f"crew_id: {crew_id}\n"
                        f"Brief du capitaine: {brief}"
                    ),
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
                    yield {
                        "type": "error",
                        "message": "Le modèle a terminé sans appeler finaliser_plan_session",
                    }
                    return

                messages.append({"role": "assistant", "content": resp.content})

                # Le raisonnement (règle 0 du skill) arrive comme bloc texte, dans le
                # même tour que les tool_use qu'il justifie -- on l'émet d'abord.
                for block in resp.content:
                    if block.type == "text" and block.text.strip():
                        yield {"type": "reasoning", "text": block.text.strip()}

                tool_results = []
                draft = None
                finalize_block_id = None

                for block in resp.content:
                    if block.type != "tool_use":
                        continue
                    if block.name == "finaliser_plan_session":
                        draft = block.input
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

                if draft is not None:
                    yield {"type": "tool_call", "tool": "finaliser_plan_session", "input": draft}
                    mismatch = _duration_mismatch(draft)
                    if mismatch is None:
                        yield {"type": "final", "result": draft}
                        return
                    # Itération sous contrainte : on ne fait pas confiance au modèle sur
                    # parole, on vérifie la somme réelle et on renvoie une correction.
                    total, cible, ecart = mismatch
                    correction = (
                        f"Le déroulé totalise {total} min mais la durée cible est "
                        f"{cible} min (écart de {ecart:+d} min, tolérance ±{TOLERANCE_MIN} min). "
                        "Ajuste la durée ou le nombre des étapes intermédiaires et rappelle "
                        "finaliser_plan_session avec un déroulé corrigé."
                    )
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": finalize_block_id,
                            "content": correction,
                            "is_error": True,
                        }
                    )
                    yield {
                        "type": "tool_result",
                        "tool": "finaliser_plan_session",
                        "output": correction,
                        "is_error": True,
                    }

                messages.append({"role": "user", "content": tool_results})

            yield {"type": "error", "message": f"max_iters ({MAX_ITERS}) atteint sans finalisation"}


async def run_agent(crew_id: str, brief: str, jwt: str) -> dict:
    """Non-streaming wrapper around run_agent_stream, for callers that only want
    the final draft (e.g. /coach/plan without debug mode). Behaviour unchanged."""
    async for event in run_agent_stream(crew_id, brief, jwt):
        if event["type"] == "final":
            return event["result"]
        if event["type"] == "error":
            raise AgentDidNotFinalizeError(event["message"])
    raise AgentDidNotFinalizeError("Boucle terminée sans résultat")
