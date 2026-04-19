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

    def handler(url, json):
        captured["url"] = url
        captured["json"] = json
        return _StubResponse(200, {"message": {"content": "hello"}})

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    out = llm.generate("what?", [{"source": "a.md", "text": "context body"}])

    assert out == "hello"
    assert captured["url"].endswith("/api/chat")
    assert captured["json"]["model"] == llm.LLM_MODEL
    assert captured["json"]["stream"] is False
    assert "context body" in captured["json"]["messages"][0]["content"]
    assert "what?" in captured["json"]["messages"][0]["content"]


def test_generate_surfaces_daemon_error(monkeypatch):
    def handler(url, json):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    with pytest.raises(RuntimeError, match="Ollama daemon not reachable"):
        llm.generate("q", [{"source": "a.md", "text": "x"}])


def test_generate_surfaces_model_missing(monkeypatch):
    def handler(url, json):
        return _StubResponse(404, text="model not found")

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    with pytest.raises(RuntimeError, match="not pulled"):
        llm.generate("q", [{"source": "a.md", "text": "x"}])


def test_generate_surfaces_invalid_json(monkeypatch):
    def handler(url, json):
        return _StubResponse(200, text="<html>bad</html>", json_error=ValueError("bad"))

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    with pytest.raises(RuntimeError, match="invalid JSON"):
        llm.generate("q", [{"source": "a.md", "text": "x"}])


def test_generate_surfaces_missing_content(monkeypatch):
    def handler(url, json):
        return _StubResponse(200, {"message": {}})

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    with pytest.raises(RuntimeError, match="missing 'message.content'"):
        llm.generate("q", [{"source": "a.md", "text": "x"}])
