import os

import requests


def _base_url():
    return os.environ["SUPABASE_URL"]


def _headers(jwt: str, extra: dict | None = None) -> dict:
    headers = {
        "apikey": os.environ["SUPABASE_ANON_KEY"],
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def insert_session(jwt: str, payload: dict) -> dict:
    """Insert a session row. RLS requires the JWT's user to have role
    capitaine/pacer in payload['crew_id'] — Supabase rejects it otherwise."""
    r = requests.post(
        f"{_base_url()}/rest/v1/sessions",
        headers=_headers(jwt, {"Prefer": "return=representation"}),
        json=payload,
        timeout=10,
    )
    r.raise_for_status()
    return r.json()[0]


def get_user_id(jwt: str) -> str:
    """Resolve the JWT to its Supabase auth UUID."""
    r = requests.get(
        f"{_base_url()}/auth/v1/user",
        headers=_headers(jwt),
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["id"]


def poster_message(jwt: str, crew_id: str, contenu: str) -> None:
    """Post a message in a crew chat as the JWT-authenticated user."""
    utilisateur_id = get_user_id(jwt)
    r = requests.post(
        f"{_base_url()}/rest/v1/messages",
        headers=_headers(jwt, {"Prefer": "return=minimal"}),
        json={"crew_id": crew_id, "utilisateur_id": utilisateur_id, "contenu": contenu},
        timeout=10,
    )
    r.raise_for_status()


def insert_groupes(jwt: str, session_id: str, groupes: list) -> None:
    if not groupes:
        return
    rows = [{**g, "session_id": session_id} for g in groupes]
    r = requests.post(
        f"{_base_url()}/rest/v1/groupes_allure",
        headers=_headers(jwt),
        json=rows,
        timeout=10,
    )
    r.raise_for_status()
