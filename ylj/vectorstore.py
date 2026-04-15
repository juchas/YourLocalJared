"""Qdrant vector store operations (local file-based, no Docker needed)."""

import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from ylj.config import COLLECTION_NAME, EMBEDDING_DIMENSION, QDRANT_PATH
from ylj.documents import Chunk

_client = None


def get_client() -> QdrantClient:
    """Get or create a Qdrant client using local file storage."""
    global _client
    if _client is None:
        QDRANT_PATH.mkdir(parents=True, exist_ok=True)
        _client = QdrantClient(path=str(QDRANT_PATH))
    return _client


def ensure_collection():
    """Create the collection if it doesn't exist."""
    client = get_client()
    collections = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in collections:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBEDDING_DIMENSION, distance=Distance.COSINE),
        )
        print(f"Created collection: {COLLECTION_NAME}")


def upsert_chunks(chunks: list[Chunk], embeddings: list[list[float]]):
    """Insert chunks with their embeddings into Qdrant."""
    client = get_client()
    ensure_collection()

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={"text": chunk.text, "source": chunk.source, "page": chunk.page},
        )
        for chunk, embedding in zip(chunks, embeddings)
    ]

    # Batch upsert in groups of 100
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        client.upsert(collection_name=COLLECTION_NAME, points=batch)
        print(f"  Upserted batch {i // batch_size + 1}/{(len(points) - 1) // batch_size + 1}")


def search(query_embedding: list[float], top_k: int) -> list[dict]:
    """Search for similar chunks. Returns empty list if no collection exists."""
    client = get_client()
    collections = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in collections:
        return []
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_embedding,
        limit=top_k,
    )
    return [
        {
            "text": point.payload["text"],
            "source": point.payload["source"],
            "page": point.payload.get("page"),
            "score": point.score,
        }
        for point in results.points
    ]


def get_collection_info() -> dict | None:
    """Get info about the current collection."""
    client = get_client()
    try:
        info = client.get_collection(COLLECTION_NAME)
        return {"name": COLLECTION_NAME, "points_count": info.points_count}
    except Exception:
        return None
