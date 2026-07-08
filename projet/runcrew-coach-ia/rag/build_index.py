"""Build (or rebuild) the persistent ChromaDB index of coaching knowledge.
Run once before starting the backend: `python -m rag.build_index` from projet/backend/.
Re-run any time knowledge/*.md changes."""

import glob
import os

import chromadb
from sentence_transformers import SentenceTransformer

HERE = os.path.dirname(__file__)
KNOWLEDGE_DIR = os.path.join(HERE, "knowledge")
INDEX_DIR = os.path.join(HERE, "chroma_db")
COLLECTION_NAME = "coaching_knowledge"


def main():
    model = SentenceTransformer("all-MiniLM-L6-v2")
    client = chromadb.PersistentClient(path=INDEX_DIR)
    client.delete_collection(COLLECTION_NAME) if COLLECTION_NAME in [
        c.name for c in client.list_collections()
    ] else None
    collection = client.get_or_create_collection(COLLECTION_NAME)

    paths = sorted(glob.glob(os.path.join(KNOWLEDGE_DIR, "*.md")))
    if not paths:
        raise SystemExit(f"Aucune fiche trouvée dans {KNOWLEDGE_DIR}")

    docs, ids = [], []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            docs.append(f.read())
        ids.append(os.path.basename(path))

    embeddings = model.encode(docs).tolist()
    collection.add(documents=docs, embeddings=embeddings, ids=ids)
    print(f"Indexé {len(docs)} fiches dans {INDEX_DIR}")


if __name__ == "__main__":
    main()
