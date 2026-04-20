"""Tests for the RAG orchestrator — assert the surface the chat UI reads.

These monkeypatch the embed/search/generate dependencies so they run
without a real vector store or Ollama. The key contract to lock in is
that every source dict coming back from `query` / `query_stream` carries
the chunk text — the server downstreams it as a preview snippet.
"""

import pytest

from ylj import rag

# ── _to_source_dict ──────────────────────────────────────────


def test_to_source_dict_carries_text_for_snippet_surface():
    """The server turns `text` into a UI-sized snippet; it must be carried
    through by the rag layer, not stripped."""
    out = rag._to_source_dict({
        "source": "/abs/a.md",
        "page": 4,
        "score": 0.87,
        "text": "the full chunk body that becomes a snippet upstream",
    })

    assert out == {
        "source": "/abs/a.md",
        "page": 4,
        "score": 0.87,
        "text": "the full chunk body that becomes a snippet upstream",
    }


def test_to_source_dict_tolerates_missing_text():
    """Older records that never had `text` shouldn't crash the pipeline —
    the server is defensive too, but the rag layer keeps the empty string
    so downstream shape stays stable."""
    out = rag._to_source_dict({"source": "/abs/a.md", "score": 0.5})

    assert out["text"] == ""
    assert out["page"] is None


# ── query end-to-end (monkeypatched deps) ─────────────────────


def _fake_search_results(bodies: list[str]) -> list[dict]:
    return [
        {"source": f"/docs/{i}.md", "page": i, "score": 0.9 - i * 0.1, "text": body}
        for i, body in enumerate(bodies, start=1)
    ]


def test_query_returns_sources_with_text(monkeypatch):
    monkeypatch.setattr(rag, "embed_query", lambda _q: [0.0] * 4)
    monkeypatch.setattr(rag, "search", lambda _v, _k: _fake_search_results([
        "alpha body", "bravo body",
    ]))
    monkeypatch.setattr(rag, "generate", lambda *_a, **_k: "the answer")

    out = rag.query("what?")

    assert out["answer"] == "the answer"
    assert len(out["sources"]) == 2
    for src, expected_body in zip(out["sources"], ["alpha body", "bravo body"]):
        assert src["text"] == expected_body
        assert "source" in src and "page" in src and "score" in src


def test_query_empty_index_short_circuits_with_no_sources(monkeypatch):
    monkeypatch.setattr(rag, "embed_query", lambda _q: [0.0] * 4)
    monkeypatch.setattr(rag, "search", lambda _v, _k: [])
    called = {"generate": 0}

    def _unused_generate(*_a, **_k):
        called["generate"] += 1
        return "should not be called"

    monkeypatch.setattr(rag, "generate", _unused_generate)

    out = rag.query("what?")

    assert out["sources"] == []
    assert called["generate"] == 0
    assert "No documents" in out["answer"]


def test_query_stream_retrieval_event_carries_text(monkeypatch):
    monkeypatch.setattr(rag, "embed_query", lambda _q: [0.0] * 4)
    monkeypatch.setattr(rag, "search", lambda _v, _k: _fake_search_results(["alpha"]))
    monkeypatch.setattr(rag, "generate_stream", lambda *_a, **_k: iter(["hi"]))

    events = list(rag.query_stream("what?"))

    retrieval = [e for e in events if e.get("event") == "retrieval"]
    assert len(retrieval) == 1
    sources = retrieval[0]["sources"]
    assert sources and sources[0]["text"] == "alpha"


def test_query_stream_search_failure_is_reported_not_raised(monkeypatch):
    monkeypatch.setattr(rag, "embed_query", lambda _q: [0.0] * 4)

    def _broken_search(*_a, **_k):
        raise RuntimeError("qdrant exploded")

    monkeypatch.setattr(rag, "search", _broken_search)

    events = list(rag.query_stream("what?"))

    assert events == [{"event": "error", "message": "retrieval failed: qdrant exploded"}]


def test_query_stream_generation_failure_is_reported_not_raised(monkeypatch):
    monkeypatch.setattr(rag, "embed_query", lambda _q: [0.0] * 4)
    monkeypatch.setattr(rag, "search", lambda _v, _k: _fake_search_results(["alpha"]))

    def _gen_boom(*_a, **_k):
        def _it():
            yield "start"
            raise RuntimeError("ollama died mid-stream")
        return _it()

    monkeypatch.setattr(rag, "generate_stream", _gen_boom)

    events = list(rag.query_stream("what?"))

    # retrieval comes first, then at least one token, then error.
    kinds = [e.get("event") for e in events]
    assert kinds[0] == "retrieval"
    assert "token" in kinds
    assert kinds[-1] == "error"
    assert "ollama died mid-stream" in events[-1]["message"]


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])
