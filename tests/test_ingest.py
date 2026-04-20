"""Tests for incremental ingest (manifest, skip, re-embed, prune, rebuild).

End-to-end paths exercise `ingest_stream` against a tmp manifest file and
monkeypatched embedding / vectorstore helpers so no Ollama, Qdrant, or
sentence-transformers runtime is needed.
"""

import json
from pathlib import Path

import pytest

from ylj import ingest as ingest_mod

# ── Fakes ──────────────────────────────────────────────────


class _FakeEmbedder:
    """Returns deterministic zero-vectors sized to match EMBEDDING_DIMENSION.

    Only `.encode(texts, show_progress_bar=False).tolist()` is exercised by
    the pipeline, so we emulate just that.
    """
    class _Arr:
        def __init__(self, rows):
            self._rows = rows

        def tolist(self):
            return self._rows

    def encode(self, texts, show_progress_bar=False):
        return _FakeEmbedder._Arr([[0.0] * 4 for _ in texts])


@pytest.fixture
def fakes(monkeypatch, tmp_path):
    """Route all side-effects through spies and redirect the manifest
    to a tmp location so tests don't stomp on the real project state."""
    manifest_path = tmp_path / "ingest_manifest.json"
    monkeypatch.setattr(ingest_mod, "_manifest_path", lambda: manifest_path)

    upserts: list[tuple[list, list]] = []
    deletes: list[str] = []
    drops: list[int] = [0]
    collection_info = {"points_count": 0}

    monkeypatch.setattr(ingest_mod, "get_embedding_model", lambda: _FakeEmbedder())
    monkeypatch.setattr(ingest_mod, "ensure_collection", lambda: None)
    monkeypatch.setattr(
        ingest_mod,
        "upsert_chunks",
        lambda chunks, embs: upserts.append((list(chunks), list(embs))),
    )
    monkeypatch.setattr(
        ingest_mod,
        "delete_by_source_file",
        lambda path: deletes.append(path),
    )
    monkeypatch.setattr(
        ingest_mod,
        "drop_collection",
        lambda: drops.__setitem__(0, drops[0] + 1),
    )
    monkeypatch.setattr(
        ingest_mod,
        "get_collection_info",
        lambda: dict(collection_info),
    )
    return {
        "manifest_path": manifest_path,
        "upserts": upserts,
        "deletes": deletes,
        "drops": drops,
        "collection_info": collection_info,
    }


def _drain(gen):
    return list(gen)


def _by_phase(events, phase):
    return [e for e in events if e.get("phase") == phase]


# ── _partition_files / _find_orphans ──────────────────────────


def test_partition_files_skips_exact_matches(tmp_path):
    p = tmp_path / "doc.txt"
    p.write_text("hello")
    st = p.stat()
    manifest = {str(p): {"mtime_ns": st.st_mtime_ns, "size": st.st_size}}

    to_process, to_skip = ingest_mod._partition_files([p], manifest)

    assert to_skip == [p]
    assert to_process == []


def test_partition_files_reprocesses_on_mtime_drift(tmp_path):
    p = tmp_path / "doc.txt"
    p.write_text("hello")
    st = p.stat()
    # Tell the manifest the file is slightly older than it really is.
    manifest = {str(p): {"mtime_ns": st.st_mtime_ns - 1, "size": st.st_size}}

    to_process, to_skip = ingest_mod._partition_files([p], manifest)

    assert to_process == [p]
    assert to_skip == []


def test_partition_files_reprocesses_on_size_drift(tmp_path):
    p = tmp_path / "doc.txt"
    p.write_text("hello")
    st = p.stat()
    manifest = {str(p): {"mtime_ns": st.st_mtime_ns, "size": st.st_size + 1}}

    to_process, _ = ingest_mod._partition_files([p], manifest)
    assert to_process == [p]


def test_find_orphans_only_under_scanned_roots(tmp_path):
    root_a = tmp_path / "a"
    root_b = tmp_path / "b"
    root_a.mkdir()
    root_b.mkdir()
    gone_in_a = root_a / "gone.txt"      # was ingested, now deleted
    gone_in_b = root_b / "gone.txt"      # would be orphaned, but b isn't scanned this run
    manifest = {
        str(gone_in_a): {"mtime_ns": 1, "size": 1},
        str(gone_in_b): {"mtime_ns": 1, "size": 1},
    }

    orphans = ingest_mod._find_orphans(manifest, [root_a])

    assert orphans == [str(gone_in_a)]


# ── ingest_stream end-to-end ──────────────────────────────


def _write_text(path: Path, body: str) -> None:
    path.write_text(body, encoding="utf-8")


def test_first_run_populates_manifest_and_upserts(fakes, tmp_path):
    root = tmp_path / "docs"
    root.mkdir()
    _write_text(root / "a.txt", "alpha alpha alpha")
    _write_text(root / "b.md", "# bravo\nbravo bravo")

    events = _drain(ingest_mod.ingest_stream([root]))

    scan = _by_phase(events, "scan")[0]
    done = _by_phase(events, "done")[0]
    assert scan["total_files"] == 2
    assert scan["skipped"] == 0
    assert done["files"] == 2
    assert done["skipped"] == 0
    assert fakes["upserts"], "expected upsert_chunks to run at least once"
    # Manifest on disk matches what we just ingested.
    manifest = json.loads(fakes["manifest_path"].read_text())
    assert manifest["version"] == 1
    assert set(manifest["files"].keys()) == {str(root / "a.txt"), str(root / "b.md")}


def test_second_run_skips_unchanged(fakes, tmp_path):
    root = tmp_path / "docs"
    root.mkdir()
    _write_text(root / "a.txt", "alpha")

    _drain(ingest_mod.ingest_stream([root]))
    fakes["upserts"].clear()
    fakes["deletes"].clear()

    events = _drain(ingest_mod.ingest_stream([root]))
    scan = _by_phase(events, "scan")[0]
    done = _by_phase(events, "done")[0]
    assert scan["total_files"] == 0
    assert scan["skipped"] == 1
    assert done["files"] == 0
    assert done["skipped"] == 1
    assert fakes["upserts"] == [], "unchanged file must not be re-embedded"
    assert fakes["deletes"] == [], "unchanged file must not be deleted"


def test_modified_file_is_deleted_before_reupsert(fakes, tmp_path):
    root = tmp_path / "docs"
    root.mkdir()
    f = root / "a.txt"
    _write_text(f, "alpha")

    _drain(ingest_mod.ingest_stream([root]))
    fakes["upserts"].clear()
    fakes["deletes"].clear()

    # Change content + nudge mtime forward.
    _write_text(f, "alpha bravo charlie")
    import os
    st = f.stat()
    os.utime(f, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))

    events = _drain(ingest_mod.ingest_stream([root]))
    scan = _by_phase(events, "scan")[0]
    assert scan["total_files"] == 1
    assert scan["skipped"] == 0
    assert fakes["deletes"] == [str(f)], "stale chunks must be deleted before re-upsert"
    assert fakes["upserts"], "modified file must be re-upserted"


def test_deleted_file_triggers_prune_event_and_manifest_drop(fakes, tmp_path):
    root = tmp_path / "docs"
    root.mkdir()
    keeper = root / "a.txt"
    gone = root / "b.txt"
    _write_text(keeper, "alpha")
    _write_text(gone, "bravo")

    _drain(ingest_mod.ingest_stream([root]))
    fakes["upserts"].clear()
    fakes["deletes"].clear()

    gone.unlink()

    events = _drain(ingest_mod.ingest_stream([root]))
    scan = _by_phase(events, "scan")[0]
    prune_events = _by_phase(events, "prune")
    done = _by_phase(events, "done")[0]
    assert scan["orphans"] == 1
    assert scan["skipped"] == 1
    assert scan["total_files"] == 0
    assert [e["file"] for e in prune_events] == [str(gone)]
    assert fakes["deletes"] == [str(gone)]
    assert done["pruned"] == 1
    # Manifest should no longer reference the removed file.
    manifest = json.loads(fakes["manifest_path"].read_text())
    assert str(gone) not in manifest["files"]
    assert str(keeper) in manifest["files"]


def test_rebuild_clears_collection_and_manifest(fakes, tmp_path):
    root = tmp_path / "docs"
    root.mkdir()
    _write_text(root / "a.txt", "alpha")

    _drain(ingest_mod.ingest_stream([root]))
    # Sanity: manifest now exists.
    assert fakes["manifest_path"].exists()
    fakes["upserts"].clear()

    events = _drain(ingest_mod.ingest_stream([root], rebuild=True))

    assert fakes["drops"][0] == 1, "drop_collection must run exactly once"
    # On rebuild the manifest is cleared first, so every file is "new":
    scan = _by_phase(events, "scan")[0]
    assert scan["total_files"] == 1
    assert scan["skipped"] == 0
    assert fakes["upserts"], "rebuild must re-embed"


def test_pre_incremental_index_forces_rebuild(fakes, tmp_path):
    """Upgrade path: collection has points but no manifest exists yet."""
    root = tmp_path / "docs"
    root.mkdir()
    _write_text(root / "a.txt", "alpha")

    # Simulate an existing index carried over from before the manifest
    # feature landed.
    fakes["collection_info"]["points_count"] = 42
    assert not fakes["manifest_path"].exists()

    events = _drain(ingest_mod.ingest_stream([root]))

    assert _by_phase(events, "rebuild"), "should emit a rebuild event before scan"
    assert fakes["drops"][0] == 1
    # Manifest was created on this run.
    assert fakes["manifest_path"].exists()


def test_error_does_not_write_manifest(fakes, tmp_path, monkeypatch):
    root = tmp_path / "docs"
    root.mkdir()
    _write_text(root / "a.txt", "alpha")

    def _blow_up(*_args, **_kwargs):
        raise RuntimeError("embedding blew up")

    # Break the pipeline after scan partitioning so we hit the error branch.
    monkeypatch.setattr(ingest_mod, "get_embedding_model", _blow_up)

    events = _drain(ingest_mod.ingest_stream([root]))

    assert _by_phase(events, "error"), "should surface an error event"
    assert not fakes["manifest_path"].exists(), (
        "manifest must not be written when ingest fails mid-run"
    )
