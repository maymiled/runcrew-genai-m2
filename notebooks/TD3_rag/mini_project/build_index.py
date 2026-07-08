"""Build a persistent ChromaDB index of the product catalog for the RAG chatbot.

Run once (re-run whenever products.csv changes):
    python build_index.py
"""
import chromadb
import pandas as pd
from sentence_transformers import SentenceTransformer

DATA_PATH = "../../data/products.csv"
INDEX_PATH = "chroma_index"
COLLECTION_NAME = "catalog"


def main():
    df = pd.read_csv(DATA_PATH)
    df["doc"] = df["name"] + " — " + df["long_description"]

    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(df["doc"].tolist(), show_progress_bar=True).tolist()

    client = chromadb.PersistentClient(path=INDEX_PATH)
    if COLLECTION_NAME in [c.name for c in client.list_collections()]:
        client.delete_collection(COLLECTION_NAME)
    collection = client.create_collection(COLLECTION_NAME)

    metadatas = [
        {
            "name": r["name"],
            "brand": r["brand"],
            "category": r["category"],
            "price": float(r["price"]),
            "short_description": r["short_description"],
            "long_description": r["long_description"],
            "attributes": r["attributes"],
        }
        for _, r in df.iterrows()
    ]

    collection.add(
        ids=df["sku"].tolist(),
        embeddings=embeddings,
        documents=df["doc"].tolist(),
        metadatas=metadatas,
    )

    print(f"Indexed {collection.count()} products into '{INDEX_PATH}/' (collection '{COLLECTION_NAME}').")


if __name__ == "__main__":
    main()
