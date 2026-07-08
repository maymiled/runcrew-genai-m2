"""Standalone stdio MCP server exposing the PIM as 5 discoverable tools.

The persistent ChromaDB index (built by build_index.py) is the source of truth for
products: search_products/get_product READ it, create_product WRITEs to it.
get_category_tree/get_category_attributes read taxonomy.json.

No API key needed here — the model calling these tools (Claude Desktop, or the
TD5 agent) brings its own.

Run directly for a stdio smoke test, or let an MCP client (Claude Desktop,
client_demo.py) spawn it:
    python pim_server.py
"""
import json
from pathlib import Path

import chromadb
from mcp.server.fastmcp import FastMCP
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent
INDEX_PATH = str(BASE_DIR / "chroma_index")
COLLECTION_NAME = "catalog"
TAXONOMY_PATH = BASE_DIR / "../../data/taxonomy.json"

with open(TAXONOMY_PATH) as f:
    taxonomy = json.load(f)

embed_model = SentenceTransformer("all-MiniLM-L6-v2")
chroma_client = chromadb.PersistentClient(path=INDEX_PATH)
try:
    collection = chroma_client.get_collection(COLLECTION_NAME)
except ValueError as exc:
    raise RuntimeError(
        f"No index found at '{INDEX_PATH}' — run `python build_index.py` first."
    ) from exc

mcp_server = FastMCP("pim")


def _hit_from(sku, metadata):
    hit = {"sku": sku, **metadata}
    for field in ("attributes", "extra"):   # stored as JSON strings -> parse back to dicts
        if isinstance(hit.get(field), str):
            hit[field] = json.loads(hit[field])
    return hit


@mcp_server.tool()
def search_products(query: str, k: int = 3) -> list:
    """Semantic search over the product catalog; returns up to k products most similar to the query."""
    q_vec = embed_model.encode(query).tolist()
    res = collection.query(query_embeddings=[q_vec], n_results=k)
    return [_hit_from(sku, meta) for sku, meta in zip(res["ids"][0], res["metadatas"][0])]


@mcp_server.tool()
def get_product(sku: str) -> dict:
    """Return one product's full document and metadata by its SKU. Empty dict if not found."""
    res = collection.get(ids=[sku], include=["documents", "metadatas"])
    if not res["ids"]:
        return {}
    hit = _hit_from(res["ids"][0], res["metadatas"][0])
    hit["doc"] = res["documents"][0]
    return hit


@mcp_server.tool()
def get_category_tree() -> dict:
    """Return the catalog category tree as a mapping from top category to a list of leaf categories."""
    return {
        cat["name"]: [sub["name"] for sub in cat["subcategories"]]
        for cat in taxonomy["categories"]
    }


@mcp_server.tool()
def get_category_attributes(category: str) -> dict:
    """Return the applicable attribute schema for a leaf category name. Empty dict if unknown."""
    for top_cat in taxonomy["categories"]:
        for sub in top_cat["subcategories"]:
            if sub["name"] == category:
                attrs = {}
                for attr in sub.get("category_attributes", []):
                    name = attr["name"]
                    if "values" in attr:
                        attrs[name] = f"enum: {', '.join(str(v) for v in attr['values'])}"
                    elif "unit" in attr:
                        attrs[name] = f"{attr['type']} ({attr['unit']})"
                    else:
                        attrs[name] = attr["type"]
                return attrs
    return {}


@mcp_server.tool()
def create_product(
    sku: str,
    name: str,
    brand: str,
    category: str,
    price: float,
    short_description: str,
    long_description: str,
    attributes: dict,
    extra: dict | None = None,
) -> dict:
    """Create a new product in the catalog: embeds it with the same MiniLM model used
    everywhere else and adds it to ChromaDB, so it is immediately searchable via
    search_products (no reindexing needed). `attributes` is the full category-attribute
    dict (all keys, null where unknown); `extra` is a catch-all for supplier info that
    fits no catalog field. Returns the created product's sku and name.
    """
    doc = f"{name} — {long_description}"
    embedding = embed_model.encode(doc).tolist()
    collection.add(
        ids=[sku],
        embeddings=[embedding],
        documents=[doc],
        metadatas=[
            {
                "name": name,
                "brand": brand,
                "category": category,
                "price": float(price),
                "short_description": short_description,
                "long_description": long_description,
                "attributes": json.dumps(attributes),
                "extra": json.dumps(extra or {}),
            }
        ],
    )
    return {"sku": sku, "name": name}


if __name__ == "__main__":
    mcp_server.run()  # stdio transport (default)
