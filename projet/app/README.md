# RunCrew — app mobile

App mobile RunCrew (React Native + Expo + Supabase) : les run clubs ("crews")
organisent leurs séances, et un agent IA (**Kipper**) aide le capitaine à :

- **générer un plan de séance** personnalisé à partir d'un brief en langage naturel
  (écran Coach IA) ;
- **discuter avec le crew** en langage naturel sur ses séances/performances
  (`questionnerKipper` → `/coach/chat`) ;
- **analyser une séance passée** (progression des coureurs, ajustements de groupes
  suggérés — `analyserSeance` → `/coach/analyse`).

Le backend correspondant vit dans [`../runcrew-coach-ia/`](../runcrew-coach-ia/).

## Stack technique

- React Native, Expo SDK 54, TypeScript, Expo Router v5
- Zustand (state), `@tanstack/react-query` (cache serveur)
- Supabase (`@supabase/supabase-js`) — Auth, PostgreSQL, Realtime

## Setup

```bash
npm install
```

Identifiants Supabase (URL + clé **anon**, publique par design — protégée par les
Row Level Security policies) en dur dans `src/lib/constantes.ts`, pas de `.env`
requis pour ça. Aucune clé API (Anthropic) n'est utilisée côté mobile — l'agent
tourne uniquement côté backend.

Le backend Coach IA tourne en local (voir `../runcrew-coach-ia/README.md`). Si tu
testes sur un device physique ou une IP LAN différente de `localhost`, copie
`.env.example` en `.env` et ajuste `EXPO_PUBLIC_COACH_API_URL`.

## Lancer

```bash
npx expo start
```

Le backend Coach IA doit tourner en parallèle (local ou déployé) pour que les
écrans Coach/Chat/Analyse fonctionnent — voir
[`../runcrew-coach-ia/README.md`](../runcrew-coach-ia/README.md). Son URL est
configurée dans `src/lib/coach.ts` (par défaut `http://localhost:5050` si aucune
URL déployée n'est renseignée).

## Structure

```
app/                  ← écrans (Expo Router) : auth, crew, session, chat, coach IA...
src/
├── lib/              ← client Supabase, constantes design, client du backend coach
├── stores/           ← Zustand (auth, crew, session, chat, coach)
├── hooks/
└── types/
```
