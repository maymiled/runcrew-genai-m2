from mcp.server.fastmcp import FastMCP

from mcp_server.rag import search as rag_search
from mcp_server.supabase_client import (
    fetch_membres_with_profils,
    parse_numrange,
    secondes_vers_allure_decimale,
)
from mcp_server.weather import get_weather

mcp_server = FastMCP("coach")


@mcp_server.tool()
def get_membres_allures(crew_id: str) -> list:
    """Return each crew member's display name and pace range as a list of
    {nom_affichage, allure_basse, allure_haute}. Paces use the packed MM.SS
    decimal convention (e.g. 5.30 means 5min30s/km) — the same convention you
    must use for the groupes you produce in finaliser_plan_session. Members who
    have not set a pace are omitted. Call this before designing pace groups so
    groups reflect the crew's real members instead of generic assumptions."""
    rows = fetch_membres_with_profils(crew_id)
    out = []
    for row in rows:
        profil = row.get("profils") or {}
        if isinstance(profil, list):
            profil = profil[0] if profil else {}
        parsed = parse_numrange(profil.get("allure_footing"))
        if parsed is None:
            continue
        basse_s, haute_s = parsed
        out.append(
            {
                "nom_affichage": profil.get("nom_affichage"),
                "allure_basse": secondes_vers_allure_decimale(basse_s),
                "allure_haute": secondes_vers_allure_decimale(haute_s),
            }
        )
    return out


@mcp_server.tool()
def search_coaching_knowledge(query: str, k: int = 3) -> list:
    """Search a small local knowledge base of running-coaching notes (interval
    structure, threshold/tempo pace definitions, warm-up/cool-down guidance,
    safety limits for mixed-level groups) and return the top-k most relevant
    text snippets. Call this before finalizing a plan whose type requires
    structured pacing knowledge (fractionne, seuil, tempo)."""
    return rag_search(query, k)


@mcp_server.tool()
def get_meteo_prevision(ville: str, date_iso: str) -> dict:
    """Return the weather forecast for a city and date: {disponible, temperature_max,
    temperature_min, precipitation_mm, condition} in °C/mm, or {disponible: false,
    message} if the city can't be geocoded or the date is out of the ~16-day forecast
    range. Call this only if you know a real city name and a date for the session
    (e.g. from the captain's brief) — use it to adjust intensity/safety advice for
    hot, cold, or rainy conditions. Skip it if no city is known."""
    return get_weather(ville, date_iso)


if __name__ == "__main__":
    mcp_server.run()
