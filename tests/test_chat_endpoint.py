"""Contract tests for POST /api/chat.

These import `ylj.server` directly and monkeypatch `server.query` so they
assert the endpoint's shape without hitting Ollama or the vectorstore.
Heavy transitive deps (sentence-transformers, qdrant-client) are required
at import time; they're installed in CI via `pip install -e .[dev]`.
"""

import pytest
from fastapi import HTTPException

from ylj import server
from ylj.server import ChatRequest, Message


def test_chat_returns_answer_and_sources(monkeypatch):
    monkeypatch.setattr(server, "query", lambda q: {
        "answer": "hi there",
        "sources": [
            {"source": "notes.md", "page": 2, "score": 0.9},
            {"source": "journal.md", "page": None, "score": 0.7},
        ],
    })

    req = ChatRequest(messages=[Message(role="user", content="what?")])
    out = server.chat(req)

    assert out["answer"] == "hi there"
    assert out["model"] == server.LLM_MODEL
    assert len(out["sources"]) == 2

    first = out["sources"][0]
    assert first["file"] == "notes.md"
    assert first["page"] == 2
    assert first["score"] == 0.9
    assert first["snippet"] is None
    assert isinstance(first["id"], str) and len(first["id"]) == 8

    # Same file at different pages should get different ids.
    assert out["sources"][1]["id"] != first["id"]


def test_chat_400_on_no_user_message(monkeypatch):
    req = ChatRequest(messages=[Message(role="assistant", content="hi")])

    with pytest.raises(HTTPException) as exc:
        server.chat(req)

    assert exc.value.status_code == 400
    assert "no user message" in exc.value.detail


def test_chat_500_on_rag_error(monkeypatch):
    def boom(_q):
        raise RuntimeError("Ollama daemon not reachable")

    monkeypatch.setattr(server, "query", boom)
    req = ChatRequest(messages=[Message(role="user", content="what?")])

    with pytest.raises(HTTPException) as exc:
        server.chat(req)

    assert exc.value.status_code == 500
    assert "Ollama daemon not reachable" in exc.value.detail


def test_chat_ignores_unknown_sources_keys(monkeypatch):
    # rag.query is free to add fields; we only read the ones we expose.
    monkeypatch.setattr(server, "query", lambda q: {
        "answer": "ok",
        "sources": [
            {"source": "a.md", "page": 1, "score": 0.5, "extra_internal": "ignore me"},
        ],
    })

    req = ChatRequest(messages=[Message(role="user", content="x")])
    out = server.chat(req)

    assert set(out["sources"][0].keys()) == {"id", "file", "page", "score", "snippet"}
