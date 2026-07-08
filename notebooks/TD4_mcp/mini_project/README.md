# PIM MCP server (TD4 mini-project)

A standalone **stdio** MCP server exposing the PIM as 5 discoverable tools, spawnable
by any MCP client — Claude Desktop today, the TD5 agent next.

- `search_products(query, k)` — semantic search over the catalog (the TD3 RAG, as a tool)
- `get_product(sku)` — read one product back from the index
- `get_category_tree()` — top category → leaf categories, from `taxonomy.json`
- `get_category_attributes(category)` — a leaf category's attribute schema
- `create_product(...)` — embeds and writes a new product; immediately searchable

The **persistent ChromaDB index is the source of truth** for products — built once
from `products.csv`, then read *and written* through the tools.

## Setup

```bash
pip install -r requirements.txt
python build_index.py     # once — builds ./chroma_index/ from ../../data/products.csv
```

No API key needed — this server never calls an LLM; whichever client connects
(Claude Desktop, the TD5 agent) brings its own model.

## Quick sanity check (no Claude Desktop needed)

```bash
python client_demo.py
```

Spawns `pim_server.py` as a real subprocess and calls each tool over stdio,
including a `create_product` immediately followed by a `search_products` that finds
it — the freshness property, end to end, out of process.

## Connect to Claude Desktop

1. Install [Claude Desktop](https://claude.ai/download), open it, sign in.
2. **Settings → Developer → Edit Config** — opens `claude_desktop_config.json`
   (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`).
3. Register the server (**absolute paths**, adjust to your machine):

```json
{
  "mcpServers": {
    "pim": {
      "command": "/Users/may/Desktop/DAUPHINE-M2/Agentic/Generative-AI-M2-Apprentissage-2026-students/genai_env/bin/python",
      "args": ["/Users/may/Desktop/DAUPHINE-M2/Agentic/Generative-AI-M2-Apprentissage-2026-students/notebooks/TD4_mcp/mini_project/pim_server.py"]
    }
  }
}
```

4. **Fully quit** Claude Desktop (⌘Q, not just close the window) and reopen —
   MCP servers are only read at startup.
5. In a new chat, open the 🛠️ tools menu and confirm the `pim` server lists all 5
   tools.

## Questions to try

- *"What noise-cancelling headphones do we carry under €300?"* → `search_products`
- *"What attributes does a Bluetooth Speaker have?"* → `get_category_attributes`
- *"Add this product: AquaBeat Pro, brand AquaBeat, category Bluetooth Speakers,
  €79, a floating waterproof pool speaker with 20-hour battery. Then find it."* →
  `create_product` followed by `search_products` — the new item comes back
  immediately, no reindexing.

## Notes

- `chroma_index/` is gitignored (regenerable build artifact) — re-run
  `build_index.py` to reset the catalog back to `products.csv`.
- Keep it minimal — a working server, not a product.
