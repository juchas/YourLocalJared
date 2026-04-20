"""Contract tests for POST /api/chat.

These import `ylj.server` directly and monkeypatch `server.query` (or
`server.query_stream`) so they assert the endpoint's shape without
hitting Ollama or the vectorstore. Heavy transitive deps (sentence-
transformers, qdrant-client) are required at import time; they're
installed in CI via `pip install -e .[dev]`.
"""

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from ylj import server
from ylj.llm import generate_stream
from ylj.server import ChatRequest, Message


def test_chat_returns_answer_and_sources(monkeypatch):
    monkeypatch.setattr(server, "query", lambda q, **kw: {
        "answer": "hi there",
        "sources": [
            {"source": "notes.md", "page": 2, "score": 0.9},
            {"source": "notes.md", "page": 3, "score": 0.7},
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
    def boom(_q, **kw):
        raise RuntimeError("Ollama daemon not reachable")

    monkeypatch.setattr(server, "query", boom)
    req = ChatRequest(messages=[Message(role="user", content="what?")])

    with pytest.raises(HTTPException) as exc:
        server.chat(req)

    assert exc.value.status_code == 500
    assert "Ollama daemon not reachable" in exc.value.detail


def test_chat_ignores_unknown_sources_keys(monkeypatch):
    # rag.query is free to add fields; we only read the ones we expose.
    monkeypatch.setattr(server, "query", lambda q, **kw: {
        "answer": "ok",
        "sources": [
            {"source": "a.md", "page": 1, "score": 0.5, "extra_internal": "ignore me"},
        ],
    })

    req = ChatRequest(messages=[Message(role="user", content="x")])
    out = server.chat(req)

    assert set(out["sources"][0].keys()) == {"id", "file", "page", "score", "snippet"}


# ── Streaming path ──────────────────────────────────────────


def _parse_sse(body: bytes) -> list[dict]:
    """Decode an SSE byte payload into its data: {json} event sequence."""
    events = []
    for frame in body.decode("utf-8").split("\n\n"):
        frame = frame.strip()
        if not frame:
            continue
        for line in frame.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: "):]))
    return events


def test_chat_stream_emits_sse_events(monkeypatch):
    """stream:true should produce a well-formed SSE sequence that wraps
    the events returned by query_stream, including the source-decoration
    step (raw `source` -> `id/file/page/score/snippet`)."""
    def fake_stream(q, **kw):
        yield {"event": "retrieval", "sources": [
            {"source": "notes.md", "page": 2, "score": 0.9},
        ]}
        yield {"event": "token", "text": "hel"}
        yield {"event": "token", "text": "lo"}
        yield {"event": "done"}

    monkeypatch.setattr(server, "query_stream", fake_stream)
    client = TestClient(server.app)
    resp = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "stream": True},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert resp.headers.get("cache-control", "").startswith("no-cache")

    events = _parse_sse(resp.content)
    assert [e["event"] for e in events] == ["retrieval", "token", "token", "done"]

    # Source dict got decorated by _decorate_sources on its way out.
    src = events[0]["sources"][0]
    assert set(src.keys()) == {"id", "file", "page", "score", "snippet"}
    assert src["file"] == "notes.md"
    assert src["page"] == 2
    assert src["score"] == 0.9
    assert src["snippet"] is None

    assert events[1]["text"] == "hel"
    assert events[2]["text"] == "lo"


def test_chat_stream_error_event_reaches_client(monkeypatch):
    """An error yielded by query_stream must be forwarded, not swallowed,
    so the UI can show a proper failure bubble."""
    def fake_stream(q, **kw):
        yield {"event": "retrieval", "sources": []}
        yield {"event": "error", "message": "Ollama daemon not reachable"}

    monkeypatch.setattr(server, "query_stream", fake_stream)
    client = TestClient(server.app)
    resp = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "x"}], "stream": True},
    )
    assert resp.status_code == 200
    events = _parse_sse(resp.content)
    assert events[-1] == {"event": "error", "message": "Ollama daemon not reachable"}


# ── generate_stream unit tests ──────────────────────────────────────────────


def _mock_stream_client(lines, status_code=200):
    """Return a mock httpx.Client whose stream() context manager serves NDJSON lines."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.iter_lines.return_value = iter(lines)
    mock_response.read.return_value = b"error body"

    mock_ctx = MagicMock()
    mock_ctx.__enter__.return_value = mock_response
    mock_ctx.__exit__.return_value = False

    mock_client = MagicMock()
    mock_client.stream.return_value = mock_ctx
    return mock_client


def test_generate_stream_yields_tokens():
    lines = [
        json.dumps({"message": {"content": "hel"}}),
        json.dumps({"message": {"content": "lo"}}),
        json.dumps({"done": True}),
    ]
    with patch("ylj.llm.httpx.Client", return_value=_mock_stream_client(lines)):
        tokens = list(generate_stream("hi", []))
    assert tokens == ["hel", "lo"]


def test_generate_stream_skips_malformed_ndjson():
    lines = [
        "not-json{{",
        json.dumps({"message": {"content": "ok"}}),
        json.dumps({"done": True}),
    ]
    with patch("ylj.llm.httpx.Client", return_value=_mock_stream_client(lines)):
        tokens = list(generate_stream("hi", []))
    assert tokens == ["ok"]


def test_generate_stream_raises_on_404():
    with patch("ylj.llm.httpx.Client", return_value=_mock_stream_client([], status_code=404)):
        with pytest.raises(RuntimeError, match="not pulled"):
            list(generate_stream("hi", [], model="no-such-model"))


def test_generate_stream_raises_on_connect_error():
    mock_ctx = MagicMock()
    mock_ctx.__enter__.side_effect = httpx.ConnectError("connection refused")
    mock_ctx.__exit__.return_value = False
    mock_client = MagicMock()
    mock_client.stream.return_value = mock_ctx

    with patch("ylj.llm.httpx.Client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="daemon not reachable"):
            list(generate_stream("hi", []))


def test_chat_non_streaming_path_still_works(monkeypatch):
    """Regression lock: stream:false (the default) must still return the
    same JSON shape as before the SSE change landed."""
    monkeypatch.setattr(server, "query", lambda q, **kw: {
        "answer": "direct",
        "sources": [{"source": "a.md", "page": 1, "score": 0.5}],
    })
    client = TestClient(server.app)
    resp = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["answer"] == "direct"
    assert set(data["sources"][0].keys()) == {"id", "file", "page", "score", "snippet"}
    assert data["model"] == server.LLM_MODEL
    assert "usage" in data
