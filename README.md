# RunCrew — GenAI M2 Hackathon

Application mobile de coaching pour clubs de running, construite avec React Native / Expo et un agent IA basé sur Claude Haiku.

## Architecture

```
runcrew/          ← App mobile (React Native + Expo + Supabase)
runcrew-coach-backend/  ← Agent coach (Flask + Claude Haiku + MCP + RAG)
notebooks/        ← TDs complétés (TD1 → TD5)
projet/           ← Sujet hackathon
```

## Stack technique

- **Frontend** : React Native, Expo SDK 54, TypeScript, Expo Router v5, Zustand
- **Backend** : Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Agent** : Claude Haiku 4.5, MCP (FastMCP), RAG (ChromaDB + sentence-transformers)
- **Modèle** : `claude-haiku-4-5`

## Agent Kipper — Coach IA

L'agent génère des plans de séance personnalisés en :
1. Fetchant les allures réelles du crew via MCP (`get_membres_allures`)
2. Recherchant les connaissances coaching via RAG (`search_coaching_knowledge`)
3. Adaptant le plan à la météo (`get_meteo_prevision`)
4. Validant la contrainte de durée par itération (boucle `reason → act → observe`)

## Lancer le projet

```bash
# App mobile
cd runcrew && npx expo start --tunnel

# Backend agent
cd runcrew-coach-backend && python app.py
```

## Variables d'environnement

Voir `.env.example` à la racine.
