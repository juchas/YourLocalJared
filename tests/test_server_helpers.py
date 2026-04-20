"""Tests for _ensure_ollama_running in ylj/server.py.

Covers the three meaningful outcomes: daemon already up (no spawn),
daemon down and successfully started, and binary not found.
"""

from ylj import server


def test_ensure_ollama_running_already_up(monkeypatch):
    """Daemon already running → True immediately, Popen never called."""
    monkeypatch.setattr(server, "ollama_status_check", lambda: {"running": True})
    popen_calls = []
    monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **kw: popen_calls.append(1))

    assert server._ensure_ollama_running() is True
    assert popen_calls == []


def test_ensure_ollama_running_starts_daemon(monkeypatch):
    """Daemon down, Popen succeeds, first poll sees it running → True."""
    call_count = [0]

    def fake_status():
        call_count[0] += 1
        # First call (initial check): not running. Second call (poll): running.
        return {"running": call_count[0] > 1}

    monkeypatch.setattr(server, "ollama_status_check", fake_status)
    monkeypatch.setattr(server, "_resolve_ollama", lambda: "ollama")
    monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **kw: None)
    monkeypatch.setattr(server.time, "sleep", lambda _: None)

    assert server._ensure_ollama_running() is True


def test_ensure_ollama_running_binary_not_found(monkeypatch):
    """Popen raises FileNotFoundError → returns False without raising."""
    monkeypatch.setattr(server, "ollama_status_check", lambda: {"running": False})
    monkeypatch.setattr(server, "_resolve_ollama", lambda: "ollama")

    def raise_fnf(*a, **kw):
        raise FileNotFoundError("ollama not found")

    monkeypatch.setattr(server.subprocess, "Popen", raise_fnf)

    assert server._ensure_ollama_running() is False
