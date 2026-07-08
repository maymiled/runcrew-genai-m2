# RunCrew — Generative AI M2 (Dauphine) — Groupe Mayy / Giuliano

Repo de groupe pour le module Generative AI (M2 IASD, 2026). Contient :

- `notebooks/` — les 5 TD du cours (TD1 embeddings → TD5 agent), à compléter.
- `projet/` — le projet hackathon (Track 1) : **RunCrew Coach IA**, un agent qui
  génère et ajuste les séances d'entraînement pour les clubs de running RunCrew.
  - `projet/app/` — l'app mobile RunCrew (React Native/Expo + Supabase), avec l'écran
    "Coach IA" intégré (bouton sur la page crew → brief → aperçu → publication).
  - `projet/runcrew-coach-ia/` — le backend de l'agent (Flask + MCP + RAG + boucle
    Haiku). Voir `projet/runcrew-coach-ia/README.md` pour le run.

## RunCrew — contexte produit

RunCrew est une app mobile (React Native/Expo + Supabase) qui aide les clubs de
running à organiser leurs séances. L'app mobile (`projet/app/`) et le backend agent
(`projet/runcrew-coach-ia/`) parlent au même projet Supabase ; le backend appelle
l'API REST de Supabase en forwardant le token du capitaine connecté (les RLS
s'appliquent normalement, pas de clé service-role nécessaire).

## Statut

- [ ] TD1 – Embeddings
- [ ] TD2 – Classification
- [ ] TD3 – RAG (+ mini-projet)
- [ ] TD4 – MCP (+ mini-projet)
- [ ] TD5 – Agent (+ mini-projet)
- [x] Projet hackathon — Coach IA (MVP construit : lecture allures crew, RAG coaching,
      génération + publication de séance avec validation humaine ; à tester avec une
      vraie clé Anthropic avant la démo — voir `projet/runcrew-coach-ia/README.md`)
