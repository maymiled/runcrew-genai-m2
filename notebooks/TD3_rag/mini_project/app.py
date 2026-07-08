"""Fnac-style catalog Q&A chatbot — retrieve (persistent ChromaDB) + grounded answer (Claude Haiku).

Run:
    python build_index.py   # once
    python app.py           # then open http://localhost:5000
"""
import os

import anthropic
import chromadb
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from sentence_transformers import SentenceTransformer

load_dotenv()  # reads ANTHROPIC_API_KEY from a .env file (this folder or the project root)
if not os.getenv("ANTHROPIC_API_KEY"):
    raise RuntimeError(
        "ANTHROPIC_API_KEY not found. Create a .env file with ANTHROPIC_API_KEY=sk-ant-..."
    )

INDEX_PATH = "chroma_index"
COLLECTION_NAME = "catalog"
MODEL = "claude-haiku-4-5"

client = anthropic.Anthropic()
embed_model = SentenceTransformer("all-MiniLM-L6-v2")
chroma_client = chromadb.PersistentClient(path=INDEX_PATH)
try:
    collection = chroma_client.get_collection(COLLECTION_NAME)
except ValueError as exc:
    raise RuntimeError("No index found — run `python build_index.py` first.") from exc

app = Flask(__name__)


def retrieve(query_text, k=4):
    """Return the k catalog products most similar to query_text."""
    query_emb = embed_model.encode(query_text).tolist()
    results = collection.query(query_embeddings=[query_emb], n_results=k)
    hits = []
    for sku, metadata in zip(results["ids"][0], results["metadatas"][0]):
        hit = {"sku": sku}
        hit.update(metadata)
        hits.append(hit)
    return hits


def answer_question(question, k=4):
    """Answer a question about the catalog, grounded in the k most relevant products."""
    hits = retrieve(question, k=k)
    context = "\n".join(
        f"- {h['name']} ({h['category']}, {h['price']:.0f}€): {h['short_description']}"
        for h in hits
    )
    prompt = (
        "Answer the question using ONLY the catalog products listed below. "
        "If nothing fits, say so.\n\n"
        f"Catalog products:\n{context}\n\nQuestion: {question}"
    )
    resp = client.messages.create(
        model=MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text, hits


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/ask", methods=["POST"])
def ask():
    question = (request.json or {}).get("question", "").strip()
    if not question:
        return jsonify({"error": "empty question"}), 400
    answer, hits = answer_question(question)
    return jsonify(
        {
            "answer": answer,
            "products": [
                {"name": h["name"], "category": h["category"], "price": h["price"]}
                for h in hits
            ],
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
