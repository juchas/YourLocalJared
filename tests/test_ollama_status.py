"""Smoke tests for the Ollama status helper.

Monkeypatches httpx so tests run without a real Ollama daemon.
"""

import httpx

from ylj import llm


class _StubResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def json(self):
        return self._payload


class _StubClient:
    def __init__(self, handler):
        self._handler = handler

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def get(self, url):
        return self._handler(url)


def test_status_reports_running_and_models(monkeypatch):
    def handler(url):
        if url.endswith("/api/version"):
            return _StubResponse({"version": "0.3.12"})
        if url.endswith("/api/tags"):
            return _StubResponse({"models": [{"name": "qwen2.5:7b"}, {"name": "phi3.5:mini"}]})
        raise AssertionError(f"unexpected url: {url}")

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    out = llm.status()
    assert out == {
        "running": True,
        "version": "0.3.12",
        "models": ["qwen2.5:7b", "phi3.5:mini"],
    }


def test_status_returns_not_running_on_connection_error(monkeypatch):
    def handler(url):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    out = llm.status()
    assert out == {"running": False, "version": None, "models": []}


def test_status_never_raises_on_unexpected_exception(monkeypatch):
    def handler(url):
        raise RuntimeError("boom")

    monkeypatch.setattr(llm.httpx, "Client", lambda **kw: _StubClient(handler))

    out = llm.status()
    assert out["running"] is False
