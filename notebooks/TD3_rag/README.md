# Lab 3 (TD3) — Mini-RAG

**Duration**: ~1h15 · **Session**: 3 (July 2)

This lab has two parts: a guided **notebook** to learn the RAG pipeline, then a small **mini-project** where you turn it into a working Python application.

## The PIM task
When we add a new product, its supplier data is raw — there's no Fnac-style catalog entry yet. A base LLM doesn't
know *our* catalog or *our* house style. **RAG** fixes this: we index the **existing catalog** and, for a new
product, retrieve the **most similar existing products** to use as examples — so the model writes a new entry that
is consistent with the ones we already have.

## Goal
Build an end-to-end RAG (Retrieval Augmented Generation) pipeline over the catalog, then wrap it into a usable app.

## Part 1 — Notebook (learn the pipeline)
- Index the catalog (`../data/products.csv`) into **ChromaDB**: embed each product (same TD1 MiniLM) → store.
- Full chain: embeddings → storage → top-k retrieval → augmented generation with the Claude API (**Haiku**).
- **The core** — *retrieve-to-generate*: given a new product's raw specs, retrieve the *k* most similar existing
  products and use them as in-context examples to **write a consistent, on-brand catalog entry**.
- **Key contrast**: generate the entry **with vs. without** retrieved examples (printed side by side).
- **But is it actually better?** Build a **golden dataset** (held-out real entries) and use an **LLM-as-a-judge**
  to score the with/without ablation — then face the judge's caveats (verbosity/position bias, nondeterminism).
- **Bridge**: a small *retrieve-to-answer* demo (answer a question over the catalog) — the kernel of the mini-project.

`TD3_rag.ipynb` *(provided — to be completed)*

## Part 2 — Mini-project (build the Flask Q&A chatbot, from scratch)
Turn the `retrieve → answer` loop into a small **Flask web app** — a Fnac.com-style **product chatbot**: a page
with a text box where a user asks a question about the catalog and gets a grounded answer. You build it **from
scratch** with Claude Code (we ship no scaffold); the notebook's final section is a full brief. Two pieces:
- **`build_index.py`** — loads `products.csv`, embeds each product with MiniLM, and builds a **persistent**
  ChromaDB index on disk (run once, so the app doesn't re-embed on every request);
- **the Flask app** — loads that persistent index and exposes a page/endpoint that runs `retrieve → grounded-answer`
  (the `answer_question` logic from the notebook) and renders the reply.

Reuse `retrieve` and `answer_question` from the notebook as the kernel. Ground rules: **Haiku only** for API
calls, **no API key in the code** (`.env`), ship a `requirements.txt` and a short `README.md` with run instructions
(`python build_index.py`, then run the app). Keep it minimal — a working POC, not a product.

## Why it matters (the takeaway)
The model didn't know our catalog; retrieval injects it at runtime — no retraining. The retrieved entries even
carry the house style by example. And freshness is *live-demonstrable*: index a product, query a moment later, it's
already retrievable. In **TD4** you expose this search as an MCP tool, and in **TD5** the agent uses it to write
entries for incoming products.

## Deliverables (committed to your repo)
- the **completed notebook** + a short analysis of what retrieval adds;
- the **mini-project** code — in a `mini_project/` folder next to the notebook (`notebooks/TD3_rag/mini_project/`):
  `build_index.py` + the Flask app, with `requirements.txt`, a short `README.md`, and run instructions.
