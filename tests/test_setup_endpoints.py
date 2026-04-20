"""Contract tests for POST /api/setup/ingest and POST /api/setup/apply.

These cover the streaming NDJSON framing, the loopback-only guard, and the
unsafe-path rejection — features the wizard depends on without any
end-to-end test elsewhere in the suite.
"""

import json

from fastapi.testclient import TestClient

from ylj import server


def _ev(phase, **extra):
    return {"phase": phase, **extra}


def test_setup_ingest_streams_ndjson(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: True)
    # Pretend tmp_path is under $HOME so the safe-path check passes,
    # without needing a real $HOME directory at test time.
    monkeypatch.setattr(server.scanner, "safe_home_path", lambda p: tmp_path)

    fake_events = [
        _ev("scan", total_files=2),
        _ev("parse", file="a.md", chunks=1, ms=5, files_done=1),
        _ev("parse", file="b.md", chunks=2, ms=8, files_done=2),
        _ev("embed", chunks_done=3),
        _ev("store", chunks_done=3),
        _ev("done", files=2, chunks=3),
    ]

    def fake_ingest_stream(dirs, ext):
        assert dirs == [tmp_path]
        yield from fake_events

    # ingest is imported lazily inside the endpoint, so monkeypatch the
    # attribute on the module that owns it.
    import ylj.ingest

    monkeypatch.setattr(ylj.ingest, "ingest_stream", fake_ingest_stream)

    client = TestClient(server.app)
    with client.stream(
        "POST",
        "/api/setup/ingest",
        json={"folders": [str(tmp_path)], "extensions": [".md"]},
    ) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/x-ndjson")
        body = b"".join(r.iter_bytes()).decode("utf-8")

    lines = [ln for ln in body.split("\n") if ln]
    assert len(lines) == len(fake_events)
    parsed = [json.loads(ln) for ln in lines]
    assert parsed == fake_events


def test_setup_ingest_rejects_non_loopback(monkeypatch):
    client = TestClient(server.app)
    # Force the loopback guard to fail without spinning up a real LAN client.
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: False)

    r = client.post(
        "/api/setup/ingest",
        json={"folders": ["/tmp/anything"], "extensions": [".md"]},
    )
    assert r.status_code == 403
    assert "localhost" in r.json()["detail"].lower()


def test_setup_ingest_rejects_unsafe_path(monkeypatch):
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: True)

    def reject(_p):
        raise ValueError("outside $HOME")

    monkeypatch.setattr(server.scanner, "safe_home_path", reject)
    client = TestClient(server.app)

    r = client.post(
        "/api/setup/ingest",
        json={"folders": ["/etc"], "extensions": [".md"]},
    )
    assert r.status_code == 400
    assert "unsafe path" in r.json()["detail"]


def test_setup_apply_rejects_non_loopback(monkeypatch):
    monkeypatch.setattr(server, "_is_loopback_request", lambda _r: False)
    client = TestClient(server.app)

    r = client.post(
        "/api/setup/apply",
        json={
            "llm_model": "gemma4:e4b",
            "embedding_model": "BAAI/bge-small-en-v1.5",
            "embedding_dimension": 384,
        },
    )
    assert r.status_code == 403
    assert "localhost" in r.json()["detail"].lower()
