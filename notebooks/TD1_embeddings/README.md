# Lab 1 (TD1) — Embeddings: Understanding the Semantic Space

**Duration**: ~1h · **Session**: 2 (June 30)

## The story so far
Across all five labs you build one thing: a **PIM assistant** — a tool that helps manage a product
catalog, in the spirit of the Akeneo AI Agent from the lecture. Everything starts here, with the
question every later lab depends on: **how does a computer represent the *meaning* of a product?**

## Goal
Understand what an embedding is and how different models encode meaning.

## What you'll do
Using the shared catalog in `../data/products.csv`:
- See why **word-overlap** (lexical) similarity fails, and why we need *meaning*.
- Turn product text into vectors with `sentence-transformers` (e.g. `all-MiniLM-L6-v2`, `all-mpnet-base-v2`, a multilingual model).
- Measure semantic closeness with **cosine similarity**, and build a tiny **vector search** (top-k nearest neighbours) over the catalog.
- Visualize the catalog in 2D with **PCA** and observe that product **categories form clusters**.
- Probe a **multilingual** model with a French query.
- **Compare** the models: semantic quality vs. dimensionality vs. speed, and pick one for the PIM.

## Deliverable
Completed notebook (filled-in `# TODO` cells) + answers to the analysis questions, committed to your repo.

## Why it matters (the takeaway)
Similar products end up *physically close* in vector space. This is the foundation for **searching** the
catalog (TD3 RAG) and **classifying** products (TD2).

## Notebook
`TD1_embeddings.ipynb` *(provided — to be completed)*
