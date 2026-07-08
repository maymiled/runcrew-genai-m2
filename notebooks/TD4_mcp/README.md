# Lab 4 (TD4) — Mini-MCP

**Duration**: ~1h · **Session**: 3 (July 2)

This lab has two parts: a guided **notebook** to understand the Model Context Protocol, then a small **mini-project** where you build a real MCP server.

## The PIM task
For an agent to act on the catalog, it needs **operations** it can call: search products, fetch one, read the
category tree, read a category's attribute schema, create a product. Instead of wiring these ad hoc, you expose
them through **MCP** — a standard protocol — so *any* agent can plug into your PIM. (Comes **before** the agent lab:
in TD5 your agent consumes exactly these tools.)

## Goal
Understand the Model Context Protocol (MCP) — a standardized way to expose tools to LLMs — and build one yourself.

## Part 1 — Notebook (understand the protocol)
- Why MCP: feel the pain of an **ad-hoc tool** first, then standardize it.
- Build a minimal **MCP server** with `FastMCP` — a function + its **docstring + type hints** *is* the tool contract.
- A **client discovers and calls** your tools over the protocol — **without importing your code**.
- Expose the real PIM tools: **`search_products`** (this *is* your TD3 RAG, now a tool) and `get_category_attributes`
  (an exact structured contract) — the MCP-vs-RAG split made concrete.
- Wire it into the **smallest possible AI agent** to see a model discover and call your tools.

`TD4_mcp.ipynb` *(provided — to be completed)*

## Part 2 — Mini-project (build the server)
Build a standalone **stdio** MCP server **from scratch** with Claude Code (we ship no scaffold) — the notebook's final
section is the full brief. The notebook ran the server in-memory for teaching; the real value is **out-of-process**,
so a program you didn't write (Claude Desktop now, your TD5 agent later) can **spawn** it and talk to it.

The **persistent ChromaDB index is the source of truth** for products (build it once from `products.csv`, then read
*and write* it through the tools). Expose **five** PIM tools:
- `search_products(query)` → **semantic search over the persistent ChromaDB index** (your TD3 RAG, as a tool);
- `get_product(sku)` → read one product back **from ChromaDB** (document + metadata);
- `get_category_tree()` and `get_category_attributes(category)` → over `../data/taxonomy.json`;
- `create_product(...)` → the **write** operation TD5 calls: embed with the **same MiniLM** and add it to ChromaDB, so
  it's **immediately searchable** (the TD3 freshness aha, now a tool).

**The demo runs from Claude Desktop**: register the server in `claude_desktop_config.json`, restart, then ask it
questions about your catalog in natural language and watch it call your tools. (A tiny stdio `client_demo.py` is a fine
extra sanity check.) Basics: **no API key in the code** (Claude Desktop brings its own model), a `requirements.txt`, and
a short `README.md` with run instructions (build the index, the config snippet, the questions to ask).

Keep it minimal — a working server, not a product. It must be **spawnable by Claude Desktop now and by your TD5 agent later**.

## Why it matters (the takeaway)
You've turned your PIM into a set of standard, discoverable tools — and `search_products` is your TD3 RAG behind a
tool interface. In **TD5**, the agent connects to this server, discovers the tools, and calls them to do its work.

## Deliverables (committed to your repo)
- the **completed notebook**;
- the **mini-project** code (in its own folder) with run instructions.
