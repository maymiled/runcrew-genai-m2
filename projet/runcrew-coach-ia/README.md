# RunCrew — Coach IA (backend)

Agent Haiku (reason → act → observe) qui génère un plan de séance (déroulé + groupes d'allure) personnalisé
pour un crew RunCrew, à partir d'un brief en langage naturel du capitaine. Ne publie rien lui-même :
le brouillon est validé par le capitaine avant écriture (`/coach/publish`).

## Tools de l'agent

- `get_membres_allures(crew_id)` — allures réelles des membres du crew (API Supabase, JWT du capitaine forwardé).
- `search_coaching_knowledge(query, k)` — RAG sur une petite base de connaissances coaching (ChromaDB).
- `get_meteo_prevision(ville, date_iso)` — prévision météo (Open-Meteo, gratuit, sans clé) pour adapter la
  séance si forte chaleur/pluie/orage ; renvoie `{disponible: false, message}` proprement si la ville est
  inconnue ou la date hors de la fenêtre de prévision (~16 jours).
- `finaliser_plan_session` — sortie structurée finale (n'écrit rien en base). Le backend vérifie que la somme
  des `duree_min` du déroulé colle à `duree_entrainement_min` (tolérance ±5 min) ; en cas d'écart, il renvoie
  une correction à l'agent au lieu d'accepter le brouillon tel quel — une vraie itération sous contrainte,
  pas une simple instruction de prompt.

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

## Déploiement (Render)

Un `render.yaml` à la racine du repo décrit un "Blueprint" Render pour ce service.

1. Créer un compte sur [render.com](https://render.com) (gratuit, connexion via GitHub).
2. **New → Blueprint**, sélectionner ce repo — Render lit `render.yaml` et configure tout seul
   (build : `pip install -r requirements.txt && python -m rag.build_index` ; start : `gunicorn ... app:app`).
3. Renseigner dans le dashboard Render les 3 variables marquées `sync: false` dans `render.yaml` :
   `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (jamais dans le code, jamais committées).
4. Une fois déployé, Render donne une URL du type `https://runcrew-coach-ia.onrender.com`.
5. Côté app mobile : mettre `EXPO_PUBLIC_COACH_API_URL=https://runcrew-coach-ia.onrender.com` dans
   `projet/app/.env` (voir `src/lib/coach.ts`).

**Limite du tier gratuit** : le service "dort" après 15 min d'inactivité et prend ~30s à se réveiller au
prochain appel — ouvrir l'URL quelques minutes avant la démo pour la "réchauffer".

## Test rapide en ligne de commande

```bash
curl -X POST http://localhost:${PORT:-5000}/coach/plan \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"crew_id": "<uuid>", "brief": "séance fractionné 45 min, focus seuil, groupe mixte"}'
```
