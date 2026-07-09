# RunCrew — app mobile

App mobile RunCrew (React Native + Expo + Supabase) : les run clubs ("crews")
organisent leurs séances, et un écran **Coach IA** permet au capitaine de générer un
plan de séance personnalisé via l'agent backend (voir
[`../runcrew-coach-ia/`](../runcrew-coach-ia/)).

## Stack technique

- React Native, Expo SDK 54, TypeScript, Expo Router v5
- Zustand (state), `@tanstack/react-query` (cache serveur)
- Supabase (`@supabase/supabase-js`) — Auth, PostgreSQL, Realtime

## Setup

```bash
npm install
```

Pas de `.env` nécessaire pour lancer l'app : les identifiants Supabase (URL + clé
**anon**, publique par design — protégée par les Row Level Security policies) sont
en dur dans `src/lib/constantes.ts`. Aucune clé API (Anthropic) n'est utilisée
côté mobile — l'agent tourne uniquement côté backend.

## Lancer

```bash
npx expo start
```

Le backend Coach IA doit tourner en parallèle pour que l'écran Coach fonctionne —
voir [`../runcrew-coach-ia/README.md`](../runcrew-coach-ia/README.md). Son URL est
configurée dans `src/lib/coach.ts` (par défaut `http://localhost:5050`, à ajuster
selon si tu testes sur web, sur un device physique sur le même Wi-Fi, ou via un
tunnel `ngrok` pour la démo).

## Structure

```
app/                  ← écrans (Expo Router) : auth, crew, session, chat, coach IA...
src/
├── lib/              ← client Supabase, constantes design, config du backend coach
├── stores/           ← Zustand (auth, crew, session, chat, coach)
├── hooks/
└── types/
```
