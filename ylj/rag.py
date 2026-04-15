"""RAG query pipeline — ties together embeddings, vector search, and LLM generation."""

from ylj.config import TOP_K
from ylj.embeddings import embed_query
from ylj.llm import generate
from ylj.vectorstore import search


def query(question: str, top_k: int | None = None) -> dict:
    """Run a full RAG query: embed -> search -> generate."""
    k = top_k or TOP_K

    query_embedding = embed_query(question)
    results = search(query_embedding, k)

    answer = generate(question, results)

    return {
        "answer": answer,
        "sources": [
            {"source": r["source"], "page": r.get("page"), "score": r["score"]}
            for r in results
        ],
    }
