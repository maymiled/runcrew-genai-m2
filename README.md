# RunCrew — Generative AI M2 (Dauphine) — Groupe Mayy / Giuliano

Repo de groupe pour le module Generative AI (M2 IASD, 2026). Contient :

- `notebooks/` — les 5 TD du cours (TD1 embeddings → TD5 agent), à compléter.
- `projet/` — le projet hackathon (Track 1) : **RunCrew Coach IA**, un agent qui
  génère et ajuste les séances d'entraînement pour les clubs de running RunCrew.
  Voir `projet/runcrew-coach-ia/README.md`.

## RunCrew — contexte produit

RunCrew est une app mobile (React Native/Expo + Supabase) qui aide les clubs de
running à organiser leurs séances. Le code de l'app mobile vit dans un repo séparé
(propriété de Giuliano) ; ce repo ne contient que l'agent Coach IA, qui est un
service autonome parlant au même projet Supabase.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env   # remplir ANTHROPIC_API_KEY (voir resources/setup_guide.md côté cours)
```

## Statut

- [x] TD1 – Embeddings
- [x] TD2 – Classification
- [x] TD3 – RAG (+ mini-projet)
- [x] TD4 – MCP (+ mini-projet)
- [ ] TD5 – Agent (+ mini-projet) — en cours
- [ ] Projet hackathon — Coach IA
