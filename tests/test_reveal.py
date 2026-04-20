"""Tests for reveal-in-folder (platform dispatch + endpoint guards).

The subprocess is always spied — we never actually spawn Finder /
Explorer / xdg-open during the test run.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ylj import reveal, server

# ── reveal_in_folder platform dispatch ─────────────────────────


def _capture_popen():
    """Spy that records the argv that `_detached_popen` would have
    spawned without actually spawning anything."""
    calls: list[list[str]] = []

    def fake_popen(argv):
        calls.append(list(argv))

    return calls, fake_popen


def test_reveal_uses_open_minus_R_on_macos(monkeypatch):
    calls, fake = _capture_popen()
    monkeypatch.setattr(reveal, "_detached_popen", fake)
    monkeypatch.setattr(reveal.sys, "platform", "darwin")

    reveal.reveal_in_folder(Path("/Users/x/Documents/file.pdf"))

    assert calls == [["open", "-R", "/Users/x/Documents/file.pdf"]]


def test_reveal_uses_explorer_select_on_windows(monkeypatch):
    calls, fake = _capture_popen()
    monkeypatch.setattr(reveal, "_detached_popen", fake)
    monkeypatch.setattr(reveal.sys, "platform", "win32")

    reveal.reveal_in_folder(Path(r"C:\Users\x\Documents\file with space.pdf"))

    # The comma is part of the flag — no space between `/select,` and
    # the path — and the path is one token so the array form of Popen
    # quotes it for Windows without our intervention.
    assert len(calls) == 1
    argv = calls[0]
    assert argv[0] == "explorer.exe"
    assert argv[1].startswith("/select,")
    assert "file with space.pdf" in argv[1]


def test_reveal_opens_parent_on_linux(monkeypatch):
    calls, fake = _capture_popen()
    monkeypatch.setattr(reveal, "_detached_popen", fake)
    monkeypatch.setattr(reveal.sys, "platform", "linux")

    reveal.reveal_in_folder(Path("/home/x/docs/file.pdf"))

    # No cross-DE select; opening the parent directory is the realistic
    # target.
    assert calls == [["xdg-open", "/home/x/docs"]]


def test_detached_popen_uses_new_session_on_posix(monkeypatch):
    """The subprocess call on POSIX must detach via start_new_session so
    the file manager survives a server restart."""
    captured: dict = {}

    def fake_subprocess_popen(argv, **kwargs):
        captured["argv"] = argv
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(reveal.sys, "platform", "darwin")
    monkeypatch.setattr(reveal.subprocess, "Popen", fake_subprocess_popen)

    reveal._detached_popen(["open", "-R", "/tmp/x"])

    assert captured["kwargs"].get("start_new_session") is True
    # Inherited stdio is replaced with DEVNULL so the child can't hold
    # our pipes open.
    assert captured["kwargs"]["stdin"] == reveal.subprocess.DEVNULL
    assert captured["kwargs"]["stdout"] == reveal.subprocess.DEVNULL
    assert captured["kwargs"]["stderr"] == reveal.subprocess.DEVNULL


# ── /api/reveal endpoint guards ─────────────────────────────────


def test_reveal_endpoint_requires_loopback(monkeypatch):
    """Non-loopback requests reach the subprocess logic — which could
    be used to enumerate the user's filesystem — so block them hard."""
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: False)
    client = TestClient(server.app)

    r = client.post("/api/reveal", json={"path": "/tmp/anything.pdf"})

    assert r.status_code == 403
    assert "localhost" in r.json()["detail"].lower()


def test_reveal_endpoint_rejects_path_outside_home(monkeypatch, tmp_path):
    """safe_home_path guards path traversal."""
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: True)

    def reject(_p):
        raise ValueError("outside $HOME")

    monkeypatch.setattr(server.scanner, "safe_home_path", reject)
    client = TestClient(server.app)

    r = client.post("/api/reveal", json={"path": "/etc/passwd"})

    assert r.status_code == 400
    assert "outside" in r.json()["detail"].lower()


def test_reveal_endpoint_rejects_path_not_in_manifest(monkeypatch, tmp_path):
    """Second layer: only indexed files are revealable."""
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: True)
    target = tmp_path / "not-indexed.pdf"
    target.write_text("hi")
    monkeypatch.setattr(server.scanner, "safe_home_path", lambda _p: target)

    import ylj.ingest
    monkeypatch.setattr(ylj.ingest, "_load_manifest", lambda: {})

    client = TestClient(server.app)
    r = client.post("/api/reveal", json={"path": str(target)})

    assert r.status_code == 403
    assert "manifest" in r.json()["detail"].lower()


def test_reveal_endpoint_404_when_file_gone(monkeypatch, tmp_path):
    """Manifest says yes but the file was moved/deleted after ingest."""
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: True)
    ghost = tmp_path / "moved.pdf"  # never created
    monkeypatch.setattr(server.scanner, "safe_home_path", lambda _p: ghost)

    import ylj.ingest
    monkeypatch.setattr(
        ylj.ingest, "_load_manifest",
        lambda: {str(ghost): {"mtime_ns": 1, "size": 1}},
    )

    client = TestClient(server.app)
    r = client.post("/api/reveal", json={"path": str(ghost)})

    assert r.status_code == 404
    assert "no longer exists" in r.json()["detail"].lower()


def test_reveal_endpoint_happy_path(monkeypatch, tmp_path):
    """Valid request: the spy sees the resolved path go through."""
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: True)
    target = tmp_path / "real.pdf"
    target.write_text("hi")
    monkeypatch.setattr(server.scanner, "safe_home_path", lambda _p: target)

    import ylj.ingest
    monkeypatch.setattr(
        ylj.ingest, "_load_manifest",
        lambda: {str(target): {"mtime_ns": 1, "size": 1}},
    )

    called: list[Path] = []

    def spy_reveal(p):
        called.append(p)

    monkeypatch.setattr(reveal, "reveal_in_folder", spy_reveal)

    client = TestClient(server.app)
    r = client.post("/api/reveal", json={"path": str(target)})

    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    assert called == [target]


def test_reveal_endpoint_surfaces_missing_command_as_500(monkeypatch, tmp_path):
    """If the platform reveal binary isn't on PATH (rare — xdg-open
    missing on a headless box) give a clean 500 rather than letting
    FileNotFoundError bubble up."""
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: True)
    target = tmp_path / "real.pdf"
    target.write_text("hi")
    monkeypatch.setattr(server.scanner, "safe_home_path", lambda _p: target)

    import ylj.ingest
    monkeypatch.setattr(
        ylj.ingest, "_load_manifest",
        lambda: {str(target): {"mtime_ns": 1, "size": 1}},
    )

    def boom(_p):
        raise FileNotFoundError("open not found")

    monkeypatch.setattr(reveal, "reveal_in_folder", boom)

    client = TestClient(server.app)
    r = client.post("/api/reveal", json={"path": str(target)})

    assert r.status_code == 500
    assert "reveal command not available" in r.json()["detail"]


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])
