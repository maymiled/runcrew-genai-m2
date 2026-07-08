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
