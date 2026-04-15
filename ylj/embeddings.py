"""Embedding model management."""

from sentence_transformers import SentenceTransformer

from ylj.config import EMBEDDING_MODEL

_model = None


def get_embedding_model() -> SentenceTransformer:
    """Load and cache the embedding model."""
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of text chunks."""
    model = get_embedding_model()
    embeddings = model.encode(texts, show_progress_bar=True)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    """Embed a single query string."""
    model = get_embedding_model()
    return model.encode(query).tolist()
