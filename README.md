# RunCrew — Generative AI M2 (Dauphine) — Groupe Mayy / Giuliano

Repo de groupe pour le module Generative AI (M2 IASD, 2026). Contient les deux
livrables du cours :

```
notebooks/    ← les 5 TD du cours (TD1 embeddings → TD5 agent), complétés
projet/       ← le projet hackathon (Track 1) — voir projet/README.md
```

## Notebooks (TD1 → TD5)

Labs du cours : embeddings, classification, RAG, MCP, agent — chaque TD inclut son
mini-projet (`mini_project/`) quand applicable (TD3, TD4, TD5).

```bash
cd notebooks
pip install -r requirements.txt
cp ../.env.example ../.env   # à la racine du repo — renseigner ANTHROPIC_API_KEY
jupyter notebook getting_started.ipynb   # vérifie que le setup fonctionne
```

Les notebooks utilisent `python-dotenv`, qui recherche le `.env` en remontant les
dossiers parents — le mettre à la racine du repo suffit pour tous les TD.

## Projet hackathon — RunCrew Coach IA

Voir [`projet/README.md`](projet/README.md) pour l'architecture (app mobile +
backend agent) et les instructions de lancement.

## Statut

- [x] TD1 – Embeddings
- [x] TD2 – Classification
- [x] TD3 – RAG (+ mini-projet)
- [x] TD4 – MCP (+ mini-projet)
- [x] TD5 – Agent (+ mini-projet)
- [x] Projet hackathon — Coach IA (voir `projet/README.md` pour le détail)
