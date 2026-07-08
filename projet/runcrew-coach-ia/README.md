# RunCrew — Coach IA (backend)

Agent Haiku (reason → act → observe) qui génère un plan de séance (déroulé + groupes d'allure) personnalisé
pour un crew RunCrew, à partir d'un brief en langage naturel du capitaine. RAG sur une petite base de
connaissances coaching + lecture des allures réelles des membres via l'API Supabase. Ne publie rien lui-même :
le brouillon est validé par le capitaine avant écriture (`/coach/publish`).

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # renseigner ANTHROPIC_API_KEY et SUPABASE_ANON_KEY
python -m rag.build_index   # à lancer une fois (et à chaque modif de rag/knowledge/*.md)
python app.py
```

Le serveur écoute sur `0.0.0.0:5000` par défaut (`PORT=5050 python app.py` pour changer de port).
Pour tester depuis un téléphone physique, utiliser l'IP LAN du poste (`ipconfig getifaddr en0` sur macOS)
ou un tunnel `ngrok http 5000`.

**macOS** : le port 5000 est souvent déjà pris par le récepteur AirPlay (Réglages Système → Général →
AirDrop et Handoff → décocher "Récepteur AirPlay"), ou lancez simplement sur un autre port avec `PORT=5050`.

## Mode mock (dev mobile sans agent réel)

```bash
MOCK_COACH=1 python app.py
```
`/coach/plan` renvoie alors un brouillon factice conforme au contrat JSON, sans appeler Claude ni Supabase.

## Endpoints

- `POST /coach/plan` — headers `Authorization: Bearer <jwt capitaine>`, body `{crew_id, brief}` → `{draft}`
- `POST /coach/publish` — headers `Authorization: Bearer <jwt capitaine>`, body `{crew_id, cree_par, draft}` → `{session_id}`

## Test rapide en ligne de commande

```bash
curl -X POST http://localhost:${PORT:-5000}/coach/plan \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"crew_id": "<uuid>", "brief": "séance fractionné 45 min, focus seuil, groupe mixte"}'
```
