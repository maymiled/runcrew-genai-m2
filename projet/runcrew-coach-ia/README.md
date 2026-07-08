# RunCrew — Coach IA

Agent IA pour [RunCrew](../../README.md) : un capitaine de crew décrit en langage
naturel la séance qu'il veut ("fractionné 45min, groupe mixte, mardi 19h"), et
l'agent :

1. vérifie la charge d'entraînement récente du crew (évite deux séances intenses
   d'affilée) ;
2. consulte une base de connaissances coaching (RAG) pour s'inspirer d'une structure
   éprouvée ;
3. récupère les allures réelles des membres pour construire des groupes d'allure
   adaptés ;
4. consulte la météo au lieu/heure du rendez-vous ;
5. ajuste itérativement le déroulé pour respecter la durée cible ;
6. propose un brouillon de séance — **rien n'est écrit sans confirmation humaine** ;
7. une fois confirmé, écrit la séance dans le Supabase du produit RunCrew (`sessions`
   + `groupes_allure`).

C'est un service autonome (backend Python + mini frontend web) qui ne dépend pas du
code de l'app mobile Expo — il lit/écrit directement dans le même Supabase.

## Architecture

- **Agent** : boucle reason→act→observe, Claude Haiku (`claude-haiku-4-5`), appels
  d'outils manuels (`backend/agent.py`).
- **MCP** : serveur stdio (FastMCP) exposant 6 tools (`backend/mcp_server.py`,
  logique dans `backend/tools_impl.py`).
- **RAG** : ChromaDB + `all-MiniLM-L6-v2` sur un corpus de principes de coaching +
  templates de séances (`backend/rag/`, `backend/data/`).
- **Backend** : FastAPI (`backend/app.py`), sert aussi le frontend statique.
- **Frontend** : page de chat unique (`frontend/`), adaptée des maquettes RunCrew.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # puis remplir ANTHROPIC_API_KEY et SUPABASE_SERVICE_ROLE_KEY
```

```bash
python scripts/seed_demo_data.py        # crée un crew + membres + séances de démo
                                          # → copier DEMO_CREW_ID/DEMO_CAPTAIN_ID dans .env
python backend/rag/build_index.py       # construit l'index Chroma (une seule fois)
uvicorn backend.app:app --reload --app-dir .
# ouvrir http://localhost:8000
```

## Notes

- Modèle : **Haiku uniquement** (contrainte du cours, budget API limité).
- Pas d'authentification réelle côté frontend pour ce POC — le capitaine de démo
  (`DEMO_CAPTAIN_ID`) est fixé en dur, c'est un choix de scope assumé (voir plan).
- Aucune clé n'est committée (`.env` gitignoré).
