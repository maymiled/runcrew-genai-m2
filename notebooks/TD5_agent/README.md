# Lab 5 (TD5) — Mini AI Agent

**Duration**: ~1h15 · **Session**: 3 (July 2)

This lab has two parts: a guided **notebook** to learn the agent loop, then a small **mini-project** where you build a working agent application.

## The PIM task — rebuild the lecture's distributor agent
This is the **capstone**. We're a distributor (think Fnac). A supplier sends an **unstructured email** describing
new products (in prose, one blurb per product) to reference. You build an agent that handles it on its
own, by **reusing what you already built** — the **RAG index from TD3** and the **MCP server from TD4**.

The agent's flow:
1. read the email (`../data/supplier_emails/`) → recognize it's a *new-products* request;
2. load the **skill** (`../data/skills/add_product/SKILL.md`) → the procedure for adding a product;
3. parse out each product's blurb → the raw supplier specs (free-form text);
4. `get_category_tree` (MCP) → the catalog's categories;
5. for each product: **categorize** (your TD2 approach) → `get_category_attributes` (MCP) → `search_products`
   (MCP → your TD3 RAG) to pull similar existing entries → **generate** a consistent, on-brand entry →
   `create_product` (MCP).

It can also **answer questions** about the catalog via the same RAG.

## Goal
Build an AI agent that reasons, calls tools, and acts in a loop.

## Part 1 — Notebook (learn the loop)
- Agent loop with **tool use** (function calling) on the Claude API (**Haiku**).
- **Reason → Act → Observe** loop, with context kept across steps.
- Wire in the previous labs as tools:
  - **MCP (TD4)** → connect the agent to your server so it discovers and calls the PIM tools;
  - **RAG (TD3)** → reached through the `search_products` tool, to fetch similar entries before writing.

`TD5_agent.ipynb` *(provided — to be completed)*

## Part 2 — Mini-project (build the app) — the **PIM Copilot**
Turn the loop into a small **chat web-app** a catalog manager would actually use. **End goal:** paste a messy
supplier blurb into your chatbot and **watch the new product appear in the PIM**, fully attributed.
- a **Python backend** = your agent loop + an **MCP stdio client to your TD4 server** (point it at a **persistent**
  `chroma_index` on disk), exposed as one `/chat` endpoint that returns the reply **and the tool-call trace**
  (FastAPI or Flask);
- a **JS frontend** (Vue.js recommended — any framework is fine; Claude Code makes this very doable) = a chat UI
  that **shows the tool calls as they happen**, like your own Claude Desktop;
- a **PIM visualizer — provided for you** at [`../pim-prod/`](../pim-prod/) (you **don't** build this one): a small
  FastAPI + Vue app that browses any `chroma_index` and shows each product's attributes and completeness. Point it
  at the **same index** your TD4 server writes to, then watch products your chatbot adds show up there;
- what the manager does: **ask** the catalog (→ `search_products`) and **enrich/add** by pasting a messy supplier
  blurb (→ the agent categorizes, fills attributes, and `create_product` → instantly searchable, visible in the PIM);
- basics: no API key in the code, a `requirements.txt`, a short README explaining how to run it.

Keep it minimal — a working POC. **Haiku only** for API calls.

## Why it matters (the takeaway)
You've recomposed a real enterprise AI agent out of your own bricks. This is also your launchpad: the toolkit you
built across TD1–TD5 is what you'll draw on in the **hackathon**.

## Deliverables (committed to your repo)
- the **completed notebook**;
- the **mini-project** code (in its own folder) with run instructions.
