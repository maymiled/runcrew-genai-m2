import asyncio
import os
import threading
import time
import traceback
import uuid

import anyio

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, jsonify, request  # noqa: E402
from flask_cors import CORS  # noqa: E402

from agent.analyse import run_analyse, run_analyse_stream  # noqa: E402
from agent.chat import run_chat, run_chat_stream  # noqa: E402
from agent.loop import AgentDidNotFinalizeError, run_agent, run_agent_stream  # noqa: E402
from publish.supabase_write import insert_groupes, insert_session  # noqa: E402

app = Flask(__name__)
CORS(app, resources={r"/coach/*": {"origins": "*"}})

# ── Mode debug : buffer d'events en mémoire, partagé par les 3 agents ─────────
# run_id -> {"events": [...], "done": bool, "result": ..., "error": str|None, "created": float}.
# En mémoire = suffisant pour un POC de hackathon (un process, une démo à la fois),
# pas besoin de Redis. Nettoyé après RUN_TTL_S pour ne pas fuiter indéfiniment.
RUNS: dict[str, dict] = {}
RUN_TTL_S = 15 * 60


def _sweep_old_runs():
    cutoff = time.time() - RUN_TTL_S
    for run_id in [rid for rid, r in RUNS.items() if r["created"] < cutoff]:
        RUNS.pop(run_id, None)


def _start_run(stream_factory) -> str:
    """Lance un thread de fond qui pilote stream_factory() (un générateur async)
    jusqu'au bout et bufferise les events dans RUNS[run_id] au fur et à mesure
    qu'ils sont produits. Retourne le run_id à poller.

    IMPORTANT : tout le générateur tourne dans UN SEUL asyncio.run() (une seule
    tâche/event loop, du début à la fin) -- ne PAS le piloter pas-à-pas via des
    appels séparés à run_until_complete(agen.__anext__()), chacun créerait une
    tâche différente et casse les cancel scopes anyio utilisés par le client MCP
    stdio ("Attempted to exit cancel scope in a different task than it was
    entered in"). L'incrémentalité (le côté "live") vient du fait que
    run["events"].append(event) s'exécute à chaque itération du `async for`,
    pas après coup -- pas d'une boucle de pilotage externe."""
    _sweep_old_runs()
    run_id = str(uuid.uuid4())
    RUNS[run_id] = {"events": [], "done": False, "result": None, "error": None, "created": time.time()}

    async def _consume():
        run = RUNS[run_id]
        async for event in stream_factory():
            run["events"].append(event)
            if event["type"] == "final":
                run["result"] = event["result"]
            elif event["type"] == "error":
                run["error"] = event["message"]

    def worker():
        try:
            asyncio.run(_consume())
        except Exception as e:  # noqa: BLE001
            tb = traceback.format_exc()
            app.logger.error("_start_run worker crash:\n%s", tb)
            RUNS[run_id]["error"] = f"internal_error: {e}"
        finally:
            RUNS[run_id]["done"] = True

    threading.Thread(target=worker, daemon=True).start()
    return run_id


def _events_response(run_id: str):
    run = RUNS.get(run_id)
    if run is None:
        return jsonify(error="not_found", message="run_id inconnu ou expiré"), 404
    since = request.args.get("since", 0, type=int)
    return jsonify(
        events=run["events"][since:],
        next_since=len(run["events"]),
        done=run["done"],
        result=run["result"],
        error=run["error"],
    ), 200


MOCK_PLAN_EVENTS = [
    {"type": "reasoning", "text": "(mock) Je vérifie d'abord les allures réelles du crew."},
    {"type": "tool_call", "tool": "get_membres_allures", "input": {"crew_id": "mock"}},
    {"type": "tool_result", "tool": "get_membres_allures", "output": "[]", "is_error": False},
    {"type": "reasoning", "text": "(mock) Peu de données, je pars sur des groupes génériques."},
]

MOCK_DRAFT = {
    "titre": "Fractionné du mardi",
    "type_entrainement": "fractionne",
    "heure_rdv": "2026-07-14T18:30:00Z",
    "duree_entrainement_min": 45,
    "distance_km": 8.0,
    "point_rdv": "Parc de test",
    "deroulement": [
        {"ordre": 1, "titre": "Échauffement", "duree_min": 12, "description": "Footing facile + gammes"},
        {"ordre": 2, "titre": "Corps de séance", "duree_min": 25, "description": "10 x 400m allure VMA, récup 1'30 trottée"},
        {"ordre": 3, "titre": "Retour au calme", "duree_min": 8, "description": "Footing très lent + étirements"},
    ],
    "groupes": [
        {"nom": "Cool", "allure_basse": 5.5, "allure_haute": 6.0, "consignes": "Restez en zone confortable, on discute en courant", "ordre": 1},
        {"nom": "Rythmé", "allure_basse": 4.5, "allure_haute": 5.0, "consignes": "400m en 1'50-2'00, récup trottée", "ordre": 2},
        {"nom": "Ambitieux", "allure_basse": 3.8, "allure_haute": 4.2, "consignes": "400m en 1'32-1'40, récup marche 30s", "ordre": 3},
    ],
}


def extract_bearer(auth_header):
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ", 1)[1].strip() or None


# ── /coach/plan -- inchangé (pas de debug mode) ───────────────────────────────

@app.route("/coach/plan", methods=["POST"])
def coach_plan():
    jwt = extract_bearer(request.headers.get("Authorization"))
    if not jwt:
        return jsonify(error="missing_token"), 401

    body = request.get_json(silent=True) or {}
    crew_id, brief = body.get("crew_id"), body.get("brief")
    if not crew_id or not brief:
        return jsonify(error="invalid_request", message="crew_id and brief are required"), 400

    if os.environ.get("MOCK_COACH") == "1":
        return jsonify(draft=MOCK_DRAFT), 200

    try:
        draft = anyio.run(run_agent, crew_id, brief, jwt)
    except AgentDidNotFinalizeError:
        return jsonify(
            error="agent_no_finalize",
            message="L'agent n'a pas pu finaliser un plan. Réessaie avec un brief plus précis.",
        ), 502
    except Exception:
        app.logger.exception("coach_plan failed")
        return jsonify(error="internal_error"), 500

    return jsonify(draft=draft), 200


# ── /coach/plan/start + /events -- mode debug, boucle de génération de plan ──

@app.route("/coach/plan/start", methods=["POST"])
def coach_plan_start():
    jwt = extract_bearer(request.headers.get("Authorization"))
    if not jwt:
        return jsonify(error="missing_token"), 401

    body = request.get_json(silent=True) or {}
    crew_id, brief = body.get("crew_id"), body.get("brief")
    if not crew_id or not brief:
        return jsonify(error="invalid_request", message="crew_id and brief are required"), 400

    if os.environ.get("MOCK_COACH") == "1":
        run_id = str(uuid.uuid4())
        RUNS[run_id] = {
            "events": list(MOCK_PLAN_EVENTS),
            "done": True,
            "result": MOCK_DRAFT,
            "error": None,
            "created": time.time(),
        }
        return jsonify(run_id=run_id), 202

    run_id = _start_run(lambda: run_agent_stream(crew_id, brief, jwt))
    return jsonify(run_id=run_id), 202


@app.route("/coach/plan/events/<run_id>", methods=["GET"])
def coach_plan_events(run_id):
    return _events_response(run_id)


@app.route("/coach/publish", methods=["POST"])
def coach_publish():
    jwt = extract_bearer(request.headers.get("Authorization"))
    if not jwt:
        return jsonify(error="missing_token"), 401

    body = request.get_json(silent=True) or {}
    crew_id, cree_par, draft = body.get("crew_id"), body.get("cree_par"), body.get("draft")
    if not crew_id or not cree_par or not draft:
        return jsonify(error="invalid_request", message="crew_id, cree_par and draft are required"), 400

    groupes = draft.pop("groupes", [])
    payload = {**draft, "crew_id": crew_id, "cree_par": cree_par}

    try:
        session = insert_session(jwt, payload)
        insert_groupes(jwt, session["id"], groupes)
    except Exception as e:  # noqa: BLE001
        app.logger.exception("coach_publish failed")
        return jsonify(error="supabase_error", detail=str(e)), 502

    return jsonify(session_id=session["id"]), 200


# ── /coach/chat -- inchangé (pas de debug mode) ───────────────────────────────

@app.route("/coach/chat", methods=["POST"])
def coach_chat():
    jwt = extract_bearer(request.headers.get("Authorization"))
    if not jwt:
        return jsonify(error="missing_token"), 401

    body = request.get_json(silent=True) or {}
    crew_id = body.get("crew_id")
    question = body.get("question", "").strip()
    utilisateur_id = body.get("utilisateur_id")

    if not crew_id or not question:
        return jsonify(
            error="invalid_request",
            message="crew_id and question are required",
        ), 400

    try:
        reponse = anyio.run(run_chat, crew_id, question, utilisateur_id, jwt)
    except AgentDidNotFinalizeError:
        return jsonify(
            error="agent_no_finalize",
            message="Kipper n'a pas pu formuler une réponse. Réessaie.",
        ), 502
    except Exception:
        app.logger.exception("coach_chat failed")
        return jsonify(error="internal_error"), 500

    return jsonify(reponse=reponse), 200


# ── /coach/chat/start + /events -- mode debug, réponse @Kipper dans le chat ──

@app.route("/coach/chat/start", methods=["POST"])
def coach_chat_start():
    jwt = extract_bearer(request.headers.get("Authorization"))
    if not jwt:
        return jsonify(error="missing_token"), 401

    body = request.get_json(silent=True) or {}
    crew_id = body.get("crew_id")
    question = body.get("question", "").strip()
    utilisateur_id = body.get("utilisateur_id")

    if not crew_id or not question:
        return jsonify(error="invalid_request", message="crew_id and question are required"), 400

    run_id = _start_run(lambda: run_chat_stream(crew_id, question, utilisateur_id, jwt))
    return jsonify(run_id=run_id), 202


@app.route("/coach/chat/events/<run_id>", methods=["GET"])
def coach_chat_events(run_id):
    return _events_response(run_id)


# ── /coach/analyse -- inchangé (pas de debug mode) ────────────────────────────

@app.route("/coach/analyse", methods=["POST"])
def coach_analyse():
    jwt = extract_bearer(request.headers.get("Authorization"))
    if not jwt:
        return jsonify(error="missing_token"), 401

    body = request.get_json(silent=True) or {}
    session_id = body.get("session_id")
    crew_id = body.get("crew_id")
    if not session_id or not crew_id:
        return jsonify(
            error="invalid_request",
            message="session_id and crew_id are required",
        ), 400

    try:
        analyse = anyio.run(run_analyse, session_id, crew_id, jwt)
    except AgentDidNotFinalizeError:
        return jsonify(
            error="agent_no_finalize",
            message="L'agent n'a pas pu finaliser l'analyse. Réessaie.",
        ), 502
    except Exception:
        app.logger.exception("coach_analyse failed")
        return jsonify(error="internal_error"), 500

    return jsonify(analyse=analyse), 200


# ── /coach/analyse/start + /events -- mode debug, analyse post-séance ────────

@app.route("/coach/analyse/start", methods=["POST"])
def coach_analyse_start():
    jwt = extract_bearer(request.headers.get("Authorization"))
    if not jwt:
        return jsonify(error="missing_token"), 401

    body = request.get_json(silent=True) or {}
    session_id = body.get("session_id")
    crew_id = body.get("crew_id")
    if not session_id or not crew_id:
        return jsonify(error="invalid_request", message="session_id and crew_id are required"), 400

    run_id = _start_run(lambda: run_analyse_stream(session_id, crew_id, jwt))
    return jsonify(run_id=run_id), 202


@app.route("/coach/analyse/events/<run_id>", methods=["GET"])
def coach_analyse_events(run_id):
    return _events_response(run_id)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug, threaded=True)
