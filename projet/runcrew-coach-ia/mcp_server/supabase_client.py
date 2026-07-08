import os
import re

import requests

NUMRANGE_RE = re.compile(r"^[\[\(]\s*([\d.]+)\s*,\s*([\d.]+)\s*[\]\)]$")


def parse_numrange(raw):
    """Parse a Postgres NUMRANGE literal like '[5.00,5.50)' into (5.0, 5.5).
    Returns None for null, empty, or malformed/unbounded ranges."""
    if not raw:
        return None
    m = NUMRANGE_RE.match(raw.strip())
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


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
