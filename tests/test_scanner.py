"""Tests for the folder-picker scanner.

These exercise the safety envelope (``safe_home_path``), the bounded walk
(``scan_folder``), and the suggested-folders filter without loading the
full RAG stack.
"""

from pathlib import Path

import pytest

from ylj import scanner

# ── safe_home_path ────────────────────────────────────────


def test_safe_home_path_accepts_home_subpath(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    (tmp_path / "Documents").mkdir()
    resolved = scanner.safe_home_path("~/Documents")
    assert resolved == (tmp_path / "Documents").resolve()


def test_safe_home_path_rejects_parent_escape(tmp_path, monkeypatch):
    # Put "home" inside a deeper dir so ../.. actually escapes it.
    home = tmp_path / "home" / "user"
    home.mkdir(parents=True)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    with pytest.raises(ValueError, match="escapes home"):
        scanner.safe_home_path("~/../../etc")


def test_safe_home_path_rejects_absolute_outside_home(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    with pytest.raises(ValueError, match="escapes home"):
        scanner.safe_home_path("/etc")


def test_safe_home_path_rejects_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))
    with pytest.raises(ValueError, match="empty"):
        scanner.safe_home_path("   ")


def test_safe_home_path_follows_symlink_and_rejects_escape(tmp_path, monkeypatch):
    home = tmp_path / "home"
    outside = tmp_path / "outside"
    home.mkdir()
    outside.mkdir()
    (home / "trap").symlink_to(outside)
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    with pytest.raises(ValueError, match="escapes home"):
        scanner.safe_home_path("~/trap")


# ── scan_folder ───────────────────────────────────────────


def test_scan_folder_warns_not_found(tmp_path):
    result = scanner.scan_folder(tmp_path / "nonexistent")
    assert result["files"] == 0
    assert result["warn"] == "not found"


def test_scan_folder_warns_not_a_directory(tmp_path):
    f = tmp_path / "file.txt"
    f.write_text("hello")
    result = scanner.scan_folder(f)
    assert result["files"] == 0
    assert result["warn"] == "not a directory"


def test_scan_folder_counts_and_categorises(tmp_path):
    (tmp_path / "a.md").write_text("hello")
    (tmp_path / "b.pdf").write_bytes(b"%PDF-")
    (tmp_path / "c.txt").write_text("world")
    junk = tmp_path / "node_modules"
    junk.mkdir()
    (junk / "nope.md").write_text("filtered out")

    result = scanner.scan_folder(tmp_path)

    assert result["files"] == 3
    assert result["extensions"] == {".md": 1, ".pdf": 1, ".txt": 1}
    assert result["warn"] is None
    assert result["selected"] is True
    assert result["id"]
    assert result["sizeGB"] >= 0.0


def test_scan_folder_honours_file_cap(tmp_path):
    for i in range(10):
        (tmp_path / f"f{i}.md").write_text("x")

    result = scanner.scan_folder(tmp_path, file_cap=3)

    assert result["files"] == 3
    assert result["warn"] and "heavy" in result["warn"]


def test_scan_folder_honours_depth_cap(tmp_path):
    deep = tmp_path
    for i in range(6):
        deep = deep / f"d{i}"
        deep.mkdir()
    (deep / "buried.md").write_text("x")
    (tmp_path / "top.md").write_text("y")

    shallow = scanner.scan_folder(tmp_path, depth_cap=2)
    assert shallow["files"] == 1  # only top.md
    deep_enough = scanner.scan_folder(tmp_path, depth_cap=20)
    assert deep_enough["files"] == 2


def test_scan_folder_skips_symlinks(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "a.md").write_text("x")
    (tmp_path / "link").symlink_to(target)

    result = scanner.scan_folder(tmp_path)

    # Only the direct target dir contributes, not the symlink alias.
    assert result["files"] == 1


# ── suggested_folders ────────────────────────────────────


def test_suggested_folders_filters_to_existing(tmp_path, monkeypatch):
    (tmp_path / "Documents").mkdir()
    (tmp_path / "Desktop").mkdir()
    # Downloads intentionally missing.
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))

    out = scanner.suggested_folders()
    names = [p.name for p in out]
    assert "Documents" in names
    assert "Desktop" in names
    assert "Downloads" not in names


# ── list_folders integration ─────────────────────────────


def test_list_folders_returns_scanned_suggestions_and_ignores(tmp_path, monkeypatch):
    (tmp_path / "Documents").mkdir()
    (tmp_path / "Documents" / "a.md").write_text("hi")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))

    out = scanner.list_folders()
    assert isinstance(out["folders"], list)
    assert any(f["path"].endswith("Documents") for f in out["folders"])
    assert "node_modules" in out["ignores"]
    assert out["ignores"] == sorted(out["ignores"])
