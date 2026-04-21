"""Smoke tests for the install.py CLI surface.

install.py is stdlib-only so we can import it directly like any other
module. These tests cover the new --mode / --ollama-bin args and the
install-mode marker file that bootstrap reads on re-run.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

# install.py is at the repo root, not a package — load it by path.
_INSTALL_PY = Path(__file__).resolve().parent.parent / "install.py"
_spec = importlib.util.spec_from_file_location("ylj_install", _INSTALL_PY)
install = importlib.util.module_from_spec(_spec)
sys.modules["ylj_install"] = install
_spec.loader.exec_module(install)


# ── argparse ───────────────────────────────────────────────────────


def test_defaults_to_system_mode_and_no_override():
    args = install.parse_args([])
    assert args.mode == "system"
    assert args.ollama_bin is None


def test_user_mode_flag_parses():
    args = install.parse_args(["--mode", "user"])
    assert args.mode == "user"


def test_ollama_bin_flag_parses():
    args = install.parse_args(["--ollama-bin", "/opt/ylj/ollama"])
    assert args.ollama_bin == "/opt/ylj/ollama"


def test_invalid_mode_is_rejected():
    with pytest.raises(SystemExit):
        install.parse_args(["--mode", "root"])


# ── install-mode marker ─────────────────────────────────────────────


def test_write_mode_marker_round_trips(monkeypatch, tmp_path):
    marker_dir = tmp_path / ".YourLocalJared"
    monkeypatch.setattr(install, "MODE_MARKER_DIR", marker_dir)
    monkeypatch.setattr(install, "MODE_MARKER_FILE", marker_dir / "install-mode")

    install.write_mode_marker("user")

    assert (marker_dir / "install-mode").read_text(encoding="utf-8").strip() == "user"


def test_write_mode_marker_creates_parent_dir(monkeypatch, tmp_path):
    """First-time run has no ~/.YourLocalJared yet — we must create it."""
    marker_dir = tmp_path / "deeply" / "nested" / ".YourLocalJared"
    monkeypatch.setattr(install, "MODE_MARKER_DIR", marker_dir)
    monkeypatch.setattr(install, "MODE_MARKER_FILE", marker_dir / "install-mode")

    assert not marker_dir.exists()
    install.write_mode_marker("system")
    assert (marker_dir / "install-mode").exists()


def test_write_mode_marker_tolerates_permission_error(monkeypatch, caplog):
    """If the marker can't be written (read-only home, rare), log a warn
    but don't crash — the install already succeeded."""
    def _boom(*_a, **_kw):
        raise OSError("read-only filesystem")

    # Swap the class so mkdir fails.
    class _ExplodingPath:
        def __init__(self, *_a, **_kw): pass
        def mkdir(self, *_a, **_kw): raise OSError("read-only filesystem")
        def write_text(self, *_a, **_kw): raise OSError("read-only filesystem")

    monkeypatch.setattr(install, "MODE_MARKER_DIR", _ExplodingPath())
    monkeypatch.setattr(install, "MODE_MARKER_FILE", _ExplodingPath())

    # Shouldn't raise; just logs a warning.
    install.write_mode_marker("user")
