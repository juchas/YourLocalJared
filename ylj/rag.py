"""RAG query pipeline — ties together embeddings, vector search, and LLM generation."""

from typing import Iterator

from ylj.config import TOP_K
from ylj.embeddings import embed_query
from ylj.llm import generate, generate_stream
from ylj.vectorstore import search

_EMPTY_INDEX_ANSWER = (
    "No documents have been ingested yet. "
    "Please add files to your documents folder and run ingestion first.\n\n"
    "```\npython start.py --ingest --dir ./documents\n```"
)


def _to_source_dict(r: dict) -> dict:
    # `text` is carried through so the server can surface a snippet to
    # the UI. The chat endpoint truncates it to a preview-sized string
    # before sending it to the browser.
    return {
        "source": r["source"],
        "page": r.get("page"),
        "score": r["score"],
        "text": r.get("text", ""),
    }


def query(question: str, top_k: int | None = None, model: str | None = None) -> dict:
    """Run a full RAG query: embed -> search -> generate."""
    k = top_k or TOP_K

    query_embedding = embed_query(question)
    results = search(query_embedding, k)

    if not results:
        return {"answer": _EMPTY_INDEX_ANSWER, "sources": []}

    answer = generate(question, results, model=model)
    return {"answer": answer, "sources": [_to_source_dict(r) for r in results]}


def query_stream(
    question: str,
    top_k: int | None = None,
    model: str | None = None,
) -> Iterator[dict]:
    """Streaming counterpart to ``query``.

    Yields a sequence of event dicts the server can wrap into SSE:
      {"event": "retrieval", "sources": [...]}
      {"event": "token", "text": "..."}  (zero or more)
      {"event": "done"}
      {"event": "error", "message": "..."}  (instead of "done" on failure)
    """
    k = top_k or TOP_K

    try:
        query_embedding = embed_query(question)
        results = search(query_embedding, k)
    except Exception as e:  # embed / search failures still reach the UI
        yield {"event": "error", "message": f"retrieval failed: {e}"}
        return

    sources = [_to_source_dict(r) for r in results]
    yield {"event": "retrieval", "sources": sources}

    if not results:
        yield {"event": "token", "text": _EMPTY_INDEX_ANSWER}
        yield {"event": "done"}
        return

    try:
        for token in generate_stream(question, results, model=model):
            yield {"event": "token", "text": token}
    except Exception as e:
        yield {"event": "error", "message": str(e)}
        return

    yield {"event": "done"}
