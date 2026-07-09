# Projet hackathon — RunCrew Coach IA (Track 1)

Application mobile de coaching pour clubs de running (React Native/Expo + Supabase),
avec un agent IA (Claude Haiku) qui génère des plans de séance personnalisés —
littéralement le tier Pro "Plans IA personnalisés" du business plan RunCrew, sorti
en MVP pour le hackathon.

## Structure

```
app/                ← l'app mobile RunCrew (React Native + Expo + Supabase)
runcrew-coach-ia/   ← le backend de l'agent Coach IA (Flask + MCP + RAG + Claude Haiku)
```

Chaque dossier a son propre `README.md` avec les instructions de setup et de
lancement détaillées : [`app/README.md`](app/README.md) ·
[`runcrew-coach-ia/README.md`](runcrew-coach-ia/README.md).

## Comment les deux pièces se parlent

L'app mobile et le backend agent parlent au **même projet Supabase**. Le backend
n'a pas de clé service-role : il forwarde le token du capitaine connecté sur ses
appels à l'API REST Supabase, donc les Row Level Security s'appliquent normalement.

Dans l'app, l'écran "Coach IA" (sur la page d'un crew) envoie le brief du capitaine
au backend (`POST /coach/plan`), affiche le brouillon de séance généré, et
n'écrit en base qu'après validation humaine (`POST /coach/publish`).

## L'agent

Un capitaine décrit ce qu'il veut ("fractionné 45min, groupe mixte, mardi 19h") et
l'agent, en boucle reason → act → observe :

1. lit les allures réelles des membres du crew (`get_membres_allures`, via l'API
   Supabase) pour construire des groupes d'allure adaptés plutôt que génériques ;
2. consulte une base de connaissances coaching par RAG (`search_coaching_knowledge`)
   pour s'inspirer d'une structure de séance éprouvée ;
3. vérifie la météo prévue au moment de la séance (`get_meteo_prevision`, Open-Meteo,
   sans clé) pour l'adapter si besoin (chaleur, pluie) ;
4. ajuste itérativement le déroulé jusqu'à respecter la durée cible
   (`finaliser_plan_session` renvoie une correction à l'agent en cas d'écart plutôt
   que d'accepter un brouillon qui ne colle pas — une vraie itération sous
   contrainte) ;
5. propose le brouillon — **rien n'est écrit sans validation du capitaine**.

## Lancer le projet en local

```bash
# 1. Backend agent
cd runcrew-coach-ia
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # renseigner ANTHROPIC_API_KEY et SUPABASE_ANON_KEY
python -m rag.build_index
python app.py

# 2. App mobile (dans un autre terminal)
cd app
npm install
cp .env.example .env
npx expo start
```

Détails complets (mode mock sans agent réel, test curl, tunnel pour tester sur
téléphone physique...) dans les README de chaque dossier.

## Modèle

**Haiku uniquement** (`claude-haiku-4-5`) — contrainte du cours, budget API limité.
Aucune clé n'est committée (`.env` gitignoré partout).
