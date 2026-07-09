import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, jsonify, request  # noqa: E402
from flask_cors import CORS  # noqa: E402

from agent.analyse import run_analyse  # noqa: E402
from agent.chat import run_chat  # noqa: E402
from agent.loop import AgentDidNotFinalizeError, run_agent  # noqa: E402
from publish.supabase_write import insert_groupes, insert_session  # noqa: E402

app = Flask(__name__)
CORS(app, resources={r"/coach/*": {"origins": "*"}})

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
        draft = asyncio.run(run_agent(crew_id, brief, jwt))
    except AgentDidNotFinalizeError as e:
        return jsonify(
            error="agent_no_finalize",
            message="L'agent n'a pas pu finaliser un plan. Réessaie avec un brief plus précis.",
        ), 502
    except Exception:
        app.logger.exception("coach_plan failed")
        return jsonify(error="internal_error"), 500

    return jsonify(draft=draft), 200


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
        reponse = asyncio.run(run_chat(crew_id, question, utilisateur_id, jwt))
    except AgentDidNotFinalizeError:
        return jsonify(
            error="agent_no_finalize",
            message="Kipper n'a pas pu formuler une réponse. Réessaie.",
        ), 502
    except Exception:
        app.logger.exception("coach_chat failed")
        return jsonify(error="internal_error"), 500

    return jsonify(reponse=reponse), 200


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
        analyse = asyncio.run(run_analyse(session_id, crew_id, jwt))
    except AgentDidNotFinalizeError:
        return jsonify(
            error="agent_no_finalize",
            message="L'agent n'a pas pu finaliser l'analyse. Réessaie.",
        ), 502
    except Exception:
        app.logger.exception("coach_analyse failed")
        return jsonify(error="internal_error"), 500

    return jsonify(analyse=analyse), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug, threaded=True)
