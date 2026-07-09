import os
import re

import requests

NUMRANGE_RE = re.compile(r"^[\[\(]\s*([\d.]+)\s*,\s*([\d.]+)\s*[\]\)]$")


def parse_numrange(raw):
    """Parse a Postgres NUMRANGE literal like '[300,330)' into (300.0, 330.0).
    Returns None for null, empty, or malformed/unbounded ranges."""
    if not raw:
        return None
    m = NUMRANGE_RE.match(raw.strip())
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


def secondes_vers_allure_decimale(secondes: float) -> float:
    """profils.allure_footing stores pace as raw seconds/km (e.g. 330 = 5:30/km),
    but groupes_allure.allure_basse/allure_haute (and the rest of the app, via
    decimalVersAllure) use a packed MM.SS decimal (5.30 = 5min30s/km). Convert
    seconds/km into that same packed decimal so the agent's output stays
    consistent with what the app writes/renders elsewhere."""
    minutes = int(secondes // 60)
    secondes_restantes = round(secondes % 60)
    return minutes + secondes_restantes / 100


def _base_url():
    return os.environ["SUPABASE_URL"]


def _headers():
    return {
        "apikey": os.environ["SUPABASE_ANON_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_JWT']}",
    }


def get_current_user_id() -> str:
    """Get the authenticated user's UUID from the JWT (used to post messages as that user)."""
    url = f"{_base_url()}/auth/v1/user"
    r = requests.get(url, headers=_headers(), timeout=10)
    r.raise_for_status()
    return r.json()["id"]


def fetch_bilans_seance(session_id: str) -> dict:
    """Fetch all bilans for a session, enriched with runner names and target paces."""
    # 1. Session info + groupes cibles
    sess_url = f"{_base_url()}/rest/v1/sessions"
    sess_r = requests.get(
        sess_url,
        headers=_headers(),
        params={"id": f"eq.{session_id}", "select": "titre,type_entrainement,heure_rdv"},
        timeout=10,
    )
    sess_r.raise_for_status()
    sess_rows = sess_r.json()
    session_info = sess_rows[0] if sess_rows else {}

    groupes_url = f"{_base_url()}/rest/v1/groupes_allure"
    grp_r = requests.get(
        groupes_url,
        headers=_headers(),
        params={"session_id": f"eq.{session_id}", "select": "nom,allure_basse,allure_haute,ordre"},
        timeout=10,
    )
    grp_r.raise_for_status()
    groupes = grp_r.json()

    # 2. Bilans
    bilans_url = f"{_base_url()}/rest/v1/allures_reelles"
    bilans_r = requests.get(
        bilans_url,
        headers=_headers(),
        params={"session_id": f"eq.{session_id}", "select": "*"},
        timeout=10,
    )
    bilans_r.raise_for_status()
    bilans = bilans_r.json()

    # 3. Profils des runners
    if bilans:
        user_ids = list({b["utilisateur_id"] for b in bilans})
        ids_str = "(" + ",".join(user_ids) + ")"
        profils_url = f"{_base_url()}/rest/v1/profils"
        profils_r = requests.get(
            profils_url,
            headers=_headers(),
            params={"id": f"in.{ids_str}", "select": "id,nom_affichage"},
            timeout=10,
        )
        profils_r.raise_for_status()
        profils_map = {p["id"]: p["nom_affichage"] for p in profils_r.json()}
        for b in bilans:
            b["nom_affichage"] = profils_map.get(b["utilisateur_id"], "Inconnu")

    return {
        "session_titre": session_info.get("titre", "?"),
        "session_type": session_info.get("type_entrainement", "?"),
        "session_date": session_info.get("heure_rdv", "?"),
        "groupes_cible": [
            {
                "nom": g["nom"],
                "allure_basse": g["allure_basse"],
                "allure_haute": g["allure_haute"],
            }
            for g in sorted(groupes, key=lambda x: x.get("ordre", 0))
        ],
        "bilans": [
            {
                "utilisateur_id": b["utilisateur_id"],
                "nom": b.get("nom_affichage", "Inconnu"),
                "allure_reelle": b["allure_reelle"],
                "ressenti": b.get("ressenti"),
                "commentaire": b.get("commentaire"),
            }
            for b in bilans
        ],
    }


def fetch_historique_runner(utilisateur_id: str, limit: int = 4) -> list:
    """Fetch last N bilans for a runner across all sessions."""
    bilans_url = f"{_base_url()}/rest/v1/allures_reelles"
    r = requests.get(
        bilans_url,
        headers=_headers(),
        params={
            "utilisateur_id": f"eq.{utilisateur_id}",
            "select": "*",
            "order": "cree_le.desc",
            "limit": str(limit),
        },
        timeout=10,
    )
    r.raise_for_status()
    bilans = r.json()

    if not bilans:
        return []

    session_ids = list({b["session_id"] for b in bilans})
    ids_str = "(" + ",".join(session_ids) + ")"
    sess_url = f"{_base_url()}/rest/v1/sessions"
    sess_r = requests.get(
        sess_url,
        headers=_headers(),
        params={"id": f"in.{ids_str}", "select": "id,titre,type_entrainement,heure_rdv"},
        timeout=10,
    )
    sess_r.raise_for_status()
    sessions_map = {s["id"]: s for s in sess_r.json()}

    result = []
    for b in bilans:
        sess = sessions_map.get(b["session_id"], {})
        result.append(
            {
                "session_titre": sess.get("titre", "?"),
                "session_type": sess.get("type_entrainement", "?"),
                "session_date": sess.get("heure_rdv", "?"),
                "allure_reelle": b["allure_reelle"],
                "ressenti": b.get("ressenti"),
                "commentaire": b.get("commentaire"),
            }
        )
    return result


def poster_message(crew_id: str, contenu: str) -> dict:
    """Post a message in a crew chat as the authenticated user."""
    user_id = get_current_user_id()
    url = f"{_base_url()}/rest/v1/messages"
    r = requests.post(
        url,
        headers={
            **_headers(),
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json={"crew_id": crew_id, "utilisateur_id": user_id, "contenu": contenu},
        timeout=10,
    )
    r.raise_for_status()
    return {"posted": True}


def fetch_membres_with_profils(crew_id: str) -> list:
    """GET the crew's members joined with their profil (nom_affichage, allure_footing)."""
    url = f"{_base_url()}/rest/v1/membres"
    params = {
        "crew_id": f"eq.{crew_id}",
        "select": "utilisateur_id,role,profils(nom_affichage,allure_footing)",
    }
    r = requests.get(url, headers=_headers(), params=params, timeout=10)
    r.raise_for_status()
    return r.json()
