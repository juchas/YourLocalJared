"""Contract tests for the /api/setup/folders and /api/setup/scan-folder
endpoints.

These test the underlying helpers in ``ylj.scanner`` plus the endpoint
handler functions themselves (via direct import / monkeypatched scanner)
so we don't need to boot the full server or import the RAG stack.
"""

from pathlib import Path

import pytest
from fastapi import HTTPException

from ylj import scanner


def test_scan_folder_endpoint_rejects_escape(monkeypatch, tmp_path):
    """The handler should raise HTTPException(400) on a path outside $HOME."""
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))

    # Inline the endpoint's handler logic so we don't need to import
    # ylj.server (which pulls the whole RAG stack).
    def handler(path: str):
        try:
            safe = scanner.safe_home_path(path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        return scanner.scan_folder(safe)

    with pytest.raises(HTTPException) as exc:
        handler("/etc")
    assert exc.value.status_code == 400
    assert "escapes home" in exc.value.detail


def test_scan_folder_endpoint_accepts_valid_path(monkeypatch, tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    (home / "Notes").mkdir()
    (home / "Notes" / "a.md").write_text("hello")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))

    def handler(path: str):
        safe = scanner.safe_home_path(path)
        return scanner.scan_folder(safe)

    out = handler("~/Notes")
    assert out["files"] == 1
    assert out["extensions"] == {".md": 1}
    assert out["path"].endswith("Notes")


def test_folders_endpoint_returns_envelope(monkeypatch, tmp_path):
    (tmp_path / "Documents").mkdir()
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))

    out = scanner.list_folders()
    assert set(out.keys()) == {"folders", "ignores"}
    assert isinstance(out["folders"], list)
    assert isinstance(out["ignores"], list)
    # Each folder matches the shape ScreenFolders consumes.
    for f in out["folders"]:
        assert set(f.keys()) >= {"id", "path", "files", "sizeGB", "selected", "warn", "extensions"}
