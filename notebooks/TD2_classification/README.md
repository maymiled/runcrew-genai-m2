# Lab 2 (TD2) — Classification: Classic ML vs. Zero-Shot LLM

**Duration**: ~1h30 · **Sessions**: 2-3 (June 30 / July 2)

## The PIM task
A core PIM job: **file each product under the right category** in the catalog taxonomy
(`../data/taxonomy.json`). You'll solve it twice — the classic ML way and the GenAI way — and feel the
trade-offs that drove the whole ML → GenAI shift from the lecture.

## Goal
Choose between a classic ML approach and an LLM (zero-shot) approach on the same classification problem, and understand the trade-offs.

## What you'll do
On the shared catalog (`../data/products.csv`), predict each product's `category` (leaf level):
- **Approach A** — embeddings (from TD1) + a classic classifier (logistic regression on the vectors).
- **Approach B** — zero-shot with the Claude API (**Haiku model**), built up in steps to feel why *how you ask* matters:
  - **B.1** naive free-text prompt → the model is usually right, but the answer is brittle to parse (invalid/ambiguous categories);
  - **B.2** structured output (Pydantic + an `enum` of the taxonomy leaves) → always a valid category;
  - **B.3** reasoning-before-answer (concept only) → why field order turns the output into chain-of-thought.
- **Compare**: accuracy, cost, latency, need for labeled data, explainability → a strengths/weaknesses summary table.
- **Then** see what made this measurable — a labeled **golden dataset** — and why generative tasks (TD3's RAG) usually have none, which is the hard part you'll tackle next.

## Deliverable
Completed notebook + comparison table of the two approaches, committed to your repo.

## Why it matters (the takeaway)
The classic classifier needs labeled data and training; the LLM categorizes immediately, zero-shot — but at
a cost in latency, money, and control. This is the same categorization step the **agent will reuse in TD5**.

## Notebook
`TD2_classification.ipynb` *(provided — to be completed)*
