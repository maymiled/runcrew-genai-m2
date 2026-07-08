import os

import chromadb
from sentence_transformers import SentenceTransformer

INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "rag", "chroma_db")
COLLECTION_NAME = "coaching_knowledge"

_model = None
_collection = None


def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _get_collection():
    global _collection
    if _collection is None:
        client = chromadb.PersistentClient(path=INDEX_DIR)
        _collection = client.get_or_create_collection(COLLECTION_NAME)
    return _collection


def search(query: str, k: int = 3) -> list:
    """Return the top-k most relevant coaching knowledge snippets for the query."""
    collection = _get_collection()
    if collection.count() == 0:
        return []
    emb = _get_model().encode([query]).tolist()
    res = collection.query(query_embeddings=emb, n_results=min(k, collection.count()))
    return res["documents"][0] if res["documents"] else []
