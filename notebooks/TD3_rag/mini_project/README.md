# Catalog chatbot (TD3 mini-project)

A small Fnac-style product Q&A chatbot: a single chat page, backed by the same
`retrieve → grounded-answer` RAG loop built in `TD3_rag.ipynb` §7, now served by
Flask over a **persistent** ChromaDB index instead of the notebook's in-memory one.

## Setup

```bash
pip install -r requirements.txt
```

Make sure `ANTHROPIC_API_KEY` is set in a `.env` file (either in this folder, or at
the project root — `python-dotenv` looks it up automatically).

## Run

```bash
python build_index.py   # once — embeds ../../data/products.csv into ./chroma_index/
python app.py            # then open http://localhost:5000
```

Re-run `build_index.py` whenever `products.csv` changes; `chroma_index/` is
gitignored (regenerable build artifact).

## How it works

- `build_index.py` embeds every product (`name — long_description`) with
  `all-MiniLM-L6-v2` (same model as TD1/TD3) and writes them, with full metadata,
  to a persistent Chroma collection on disk.
- `app.py` loads that collection at startup, and for each question: embeds it,
  retrieves the 4 most similar products, and asks Claude Haiku to answer **grounded
  only in those retrieved products** — same logic as the notebook's
  `retrieve` / `answer_question`, just backed by a persistent store.

Model: **Haiku only**. No API key in the code.
