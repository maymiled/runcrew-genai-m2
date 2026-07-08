from mcp.server.fastmcp import FastMCP

from mcp_server.rag import search as rag_search
from mcp_server.supabase_client import fetch_membres_with_profils, parse_numrange

mcp_server = FastMCP("coach")


@mcp_server.tool()
def get_membres_allures(crew_id: str) -> list:
    """Return each crew member's display name and pace range (min/km) as a
    list of {nom_affichage, allure_basse, allure_haute}. Members who have not
    set a pace are omitted. Call this before designing pace groups so groups
    reflect the crew's real members instead of generic assumptions."""
    rows = fetch_membres_with_profils(crew_id)
    out = []
    for row in rows:
        profil = row.get("profils") or {}
        if isinstance(profil, list):
            profil = profil[0] if profil else {}
        parsed = parse_numrange(profil.get("allure_footing"))
        if parsed is None:
            continue
        out.append(
            {
                "nom_affichage": profil.get("nom_affichage"),
                "allure_basse": parsed[0],
                "allure_haute": parsed[1],
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


if __name__ == "__main__":
    mcp_server.run()
