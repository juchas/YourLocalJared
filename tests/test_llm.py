"""Tests for the Ollama-backed LLM client.

These tests monkeypatch httpx so they run without a real Ollama daemon.
They lock in the request contract (URL, payload) and the error surfaces
the UI will rely on when the daemon is down or a model is missing.
"""

import httpx
import pytest

from ylj import llm


class _StubResponse:
    def __init__(
        self,
        status_code: int,
        payload: dict | None = None,
        text: str = "",
        json_error: Exception | None = None,
    ):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text
        self._json_error = json_error

    def json(self):
        if self._json_error is not None:
            raise self._json_error
        return self._payload


class _StubClient:
    def __init__(self, handler):
        self._handler = handler

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def post(self, url, json):
        return self._handler(url, json)


def test_generate_posts_correct_payload(monkeypatch):
    captured = {}

    def handler(url, request_json):
        captured["url"] = url
        captured["request_json"] = request_json
        return _StubResponse(200, {"message": {"content": "hello"}})

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    out = llm.generate("what?", [{"source": "a.md", "text": "context body"}])

    assert out == "hello"
    assert captured["url"].endswith("/api/chat")
    assert captured["request_json"]["model"] == llm.LLM_MODEL
    assert captured["request_json"]["stream"] is False
    assert "context body" in captured["request_json"]["messages"][0]["content"]
    assert "what?" in captured["request_json"]["messages"][0]["content"]


def test_generate_surfaces_daemon_error(monkeypatch):
    def handler(url, request_json):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    with pytest.raises(RuntimeError, match="Ollama daemon not reachable"):
        llm.generate("q", [{"source": "a.md", "text": "x"}])


def test_generate_surfaces_model_missing(monkeypatch):
    def handler(url, request_json):
        return _StubResponse(404, text="model not found")

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    with pytest.raises(RuntimeError, match="not pulled"):
        llm.generate("q", [{"source": "a.md", "text": "x"}])


def test_generate_surfaces_invalid_json(monkeypatch):
    def handler(url, request_json):
        return _StubResponse(200, text="<html>bad</html>", json_error=ValueError("bad"))

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    with pytest.raises(RuntimeError, match="invalid JSON"):
        llm.generate("q", [{"source": "a.md", "text": "x"}])


def test_generate_surfaces_missing_content(monkeypatch):
    def handler(url, request_json):
        return _StubResponse(200, {"message": {}})

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    with pytest.raises(RuntimeError, match="missing 'message.content'"):
        llm.generate("q", [{"source": "a.md", "text": "x"}])


# ── prompt + context numbering for citation click-through ──────


def test_format_context_numbers_blocks_sequentially():
    """The UI parses [N] citation pills keyed on position; the prompt must
    label each context block with the same N so the model's cites line up."""
    chunks = [
        {"source": "a.md", "text": "alpha body"},
        {"source": "b.pdf", "page": 3, "text": "bravo body"},
        {"source": "c.xlsx [Sheet1]", "text": "charlie body"},
    ]

    out = llm._format_context(chunks)

    assert "[1] Source: a.md" in out
    assert "[2] Source: b.pdf, Page 3" in out
    assert "[3] Source: c.xlsx [Sheet1]" in out
    assert "alpha body" in out
    assert "bravo body" in out
    assert "charlie body" in out


def test_prompt_template_instructs_inline_citations():
    """Docstring the contract: the prompt tells the model how to cite."""
    template = llm.RAG_PROMPT_TEMPLATE.lower()
    assert "cite" in template
    assert "[1]" in template or "[n]" in template


def test_generate_prompt_contains_numbered_context(monkeypatch):
    """End-to-end: generate() feeds a prompt with numbered blocks into Ollama."""
    captured = {}

    def handler(url, request_json):
        captured["prompt"] = request_json["messages"][0]["content"]
        return _StubResponse(200, {"message": {"content": "hi"}})

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    llm.generate("q", [
        {"source": "a.md", "text": "alpha"},
        {"source": "b.md", "text": "bravo"},
    ])

    prompt = captured["prompt"]
    assert "[1] Source: a.md" in prompt
    assert "[2] Source: b.md" in prompt
