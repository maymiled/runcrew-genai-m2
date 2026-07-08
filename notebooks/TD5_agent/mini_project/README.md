# PIM Copilot (TD5 mini-project)

A small chat web-app for a Fnac catalog manager — *your own Claude Desktop, but for
your PIM*. Paste a messy supplier blurb → the agent categorizes it, writes an
on-brand entry, fills every category attribute (`null` where unknown), routes
leftover supplier info to `extra`, and creates the product. Ask a question about the
catalog and it answers, grounded in a search. Every tool call is shown live in the
chat as a trace.

This **reuses the TD4 mini-project server as-is, over stdio** — the backend never
imports its tool code, it only spawns `../../TD4_mcp/mini_project/pim_server.py` as
a subprocess and speaks MCP to it (same idea as registering it in
`claude_desktop_config.json`, just done by this backend instead of Claude Desktop).

## Setup

```bash
cd ../../TD4_mcp/mini_project
pip install -r requirements.txt
python build_index.py        # builds the persistent chroma_index the agent will read/write

cd ../../TD5_agent/mini_project/backend
pip install -r requirements.txt
```

Make sure `ANTHROPIC_API_KEY` is set in a `.env` file at the project root (the
backend loads it from there automatically).

## Run

```bash
cd backend
uvicorn app:app --reload --port 8001
# open http://localhost:8001
```

Type a question ("do we have ANC headphones under €300?") or paste a supplier blurb
(see `../../data/supplier_emails/email_01.txt` for examples) and watch the agent's
tool-call trace appear under its reply.

## See it land in the PIM (optional but worth it)

The provided read-only visualizer at [`../../pim-prod/`](../../pim-prod/) can browse
the same index live:

```bash
cd ../../pim-prod
pip install -r app/requirements.txt
PIM_INDEX_DIR=$(cd ../TD4_mcp/mini_project/chroma_index && pwd) uvicorn app.main:app --reload --app-dir . --port 8000
# open http://localhost:8000
```

Add a product through the copilot, then refresh the PIM visualizer — it appears
immediately, `extra` fields and all, with missing category attributes flagged.

## How it works

- `backend/agent.py` — the exact TD5 `run_agent` reason→act→observe loop, adapted to
  run over a **real** `mcp.client.stdio` session instead of the notebook's in-memory
  transport, and to return the tool-call trace (instead of printing it) so the
  frontend can render it. Loads the `add_product` **skill** from
  `../../data/skills/add_product/SKILL.md` into the system prompt, exactly as the
  notebook does.
- `backend/app.py` — FastAPI. On startup (`lifespan`), spawns the TD4 server once
  and keeps the MCP session alive for the app's lifetime; exposes `POST /chat`
  (`{message}` → `{reply, trace}`) and serves the frontend.
- `frontend/` — a single static page (no build step, no framework): a chat box that
  POSTs to `/chat` and renders the reply plus the ordered list of tool calls.

No propose→confirm gate here (that's the *Going further* stretch) — the agent
creates directly, and the UI shows what it did.

## Hygiene

- **Haiku only**, no API key in the code.
- `chroma_index/` (in the TD4 folder) is gitignored — a regenerable build artifact.
