"""Tests for ingest_stream's per-file error isolation.

One unparseable file (encrypted PDF, locked XLSX, corrupt archive) must
not abort the whole run — the wizard on a real 1,000+ file corpus relies
on this. These tests exercise that contract without a real embedder or
Qdrant in the loop.
"""

from pathlib import Path

import pytest

from ylj import ingest as ingest_mod


class _FakeEmbedder:
    """Minimal stand-in for the sentence-transformers model.

    Only ``encode(texts, show_progress_bar=False).tolist()`` is used
    inside the pipeline, so we emulate that and nothing else.
    """
    class _Arr:
        def __init__(self, rows):
            self._rows = rows

        def tolist(self):
            return self._rows

    def encode(self, texts, show_progress_bar=False):
        return _FakeEmbedder._Arr([[0.0] * 4 for _ in texts])


@pytest.fixture
def fakes(monkeypatch):
    upserts: list = []
    monkeypatch.setattr(ingest_mod, "get_embedding_model", lambda: _FakeEmbedder())
    monkeypatch.setattr(ingest_mod, "ensure_collection", lambda: None)
    monkeypatch.setattr(
        ingest_mod,
        "upsert_chunks",
        lambda chunks, embs: upserts.append((list(chunks), list(embs))),
    )
    return {"upserts": upserts}


def _write(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")


def _by_phase(events, phase):
    return [e for e in events if e.get("phase") == phase]


def test_parse_failure_is_isolated_to_one_file(fakes, tmp_path, monkeypatch):
    """One bad file yields a `skip` event and the rest of the corpus still gets ingested."""
    root = tmp_path / "docs"
    root.mkdir()
    good_a = root / "a.txt"
    bad = root / "b.txt"
    good_c = root / "c.txt"
    _write(good_a, "alpha")
    _write(bad, "this one blows up")
    _write(good_c, "charlie")

    real_parse = ingest_mod.parse_document

    def flaky_parse(path: Path):
        if path == bad:
            raise RuntimeError("File has not been decrypted")
        return real_parse(path)

    monkeypatch.setattr(ingest_mod, "parse_document", flaky_parse)

    events = list(ingest_mod.ingest_stream([root]))

    scan = _by_phase(events, "scan")[0]
    parsed = _by_phase(events, "parse")
    skipped = _by_phase(events, "skip")
    done = _by_phase(events, "done")
    errors = _by_phase(events, "error")

    assert scan["total_files"] == 3
    assert [e["file"] for e in parsed] == [str(good_a), str(good_c)]
    assert len(skipped) == 1
    assert skipped[0]["file"] == str(bad)
    assert skipped[0]["reason"].startswith("RuntimeError")
    assert "decrypted" in skipped[0]["reason"]
    assert errors == [], "one bad file must not abort the stream"
    assert done and done[0]["failed"] == 1
    assert done[0]["files"] == 2
    # Both good files made it through embedding.
    assert fakes["upserts"], "good files must still be upserted after a sibling failure"


def test_parse_failure_counts_failed_but_emits_done(fakes, tmp_path, monkeypatch):
    """When every file fails we still emit a terminal `done` (never an `error`)."""
    root = tmp_path / "docs"
    root.mkdir()
    _write(root / "a.txt", "alpha")
    _write(root / "b.txt", "bravo")

    def always_fail(_path):
        raise ValueError("nope")

    monkeypatch.setattr(ingest_mod, "parse_document", always_fail)

    events = list(ingest_mod.ingest_stream([root]))
    done = _by_phase(events, "done")
    errors = _by_phase(events, "error")
    skipped = _by_phase(events, "skip")

    assert errors == []
    assert len(skipped) == 2
    assert done[0] == {"phase": "done", "files": 0, "chunks": 0, "failed": 2}
    assert fakes["upserts"] == []  # nothing to store


def test_files_done_counter_advances_on_skip(fakes, tmp_path, monkeypatch):
    """The progress counter must not stall on a bad file, so the UI
    progress ring keeps moving toward 100%."""
    root = tmp_path / "docs"
    root.mkdir()
    a = root / "a.txt"
    b = root / "b.txt"
    c = root / "c.txt"
    _write(a, "alpha")
    _write(b, "bravo")
    _write(c, "charlie")

    real_parse = ingest_mod.parse_document

    def flaky_parse(path: Path):
        if path == b:
            raise RuntimeError("bang")
        return real_parse(path)

    monkeypatch.setattr(ingest_mod, "parse_document", flaky_parse)

    events = list(ingest_mod.ingest_stream([root]))

    progress = [e.get("files_done") for e in events if e.get("phase") in {"parse", "skip"}]
    # Whatever the exact order of (parse, skip, parse) events, files_done
    # must climb monotonically and land at 3.
    assert progress == sorted(progress)
    assert progress[-1] == 3
