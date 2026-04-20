"""Tests for ``ylj.server._resolve_ollama``'s search order.

The resolver has to find ollama both when bootstrap installed it via
the system package manager (on PATH) and when it installed it into a
per-user prefix (no PATH touch). These tests monkeypatch ``shutil.which``,
``sys.platform``, and ``Path.home`` so they run platform-independently.
"""

from __future__ import annotations

import os
from pathlib import Path

from ylj import server


def test_which_hit_is_returned_verbatim(monkeypatch):
    """Fast path: if ollama is on PATH we never touch the fallbacks."""
    monkeypatch.setattr(server.shutil, "which", lambda _n: "/usr/local/bin/ollama")
    # Set up a user-local bin that would win if we fell through — we
    # shouldn't, because `which` already answered.
    monkeypatch.setattr(server.sys, "platform", "darwin")
    assert server._resolve_ollama() == "/usr/local/bin/ollama"


def test_posix_user_local_fallback(monkeypatch, tmp_path):
    """POSIX: when PATH has no ollama, ~/.local/ylj/bin/ollama wins."""
    # Pretend home is a clean tmp dir so we don't trip on real state.
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    user_bin = fake_home / ".local" / "ylj" / "bin"
    user_bin.mkdir(parents=True)
    user_ollama = user_bin / "ollama"
    user_ollama.write_text("#!/bin/sh\n")
    user_ollama.chmod(0o755)

    monkeypatch.setattr(server.shutil, "which", lambda _n: None)
    monkeypatch.setattr(server.sys, "platform", "linux")
    monkeypatch.setattr(server.Path, "home", classmethod(lambda cls: fake_home))

    assert server._resolve_ollama() == str(user_ollama)


def test_macos_user_local_fallback(monkeypatch, tmp_path):
    """Same fallback on macOS (darwin uses the POSIX layout)."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    user_bin = fake_home / ".local" / "ylj" / "bin"
    user_bin.mkdir(parents=True)
    user_ollama = user_bin / "ollama"
    user_ollama.write_text("#!/bin/sh\n")
    user_ollama.chmod(0o755)

    monkeypatch.setattr(server.shutil, "which", lambda _n: None)
    monkeypatch.setattr(server.sys, "platform", "darwin")
    monkeypatch.setattr(server.Path, "home", classmethod(lambda cls: fake_home))

    assert server._resolve_ollama() == str(user_ollama)


def test_windows_user_local_fallback(monkeypatch, tmp_path):
    """Windows uses %LOCALAPPDATA%\\YourLocalJared\\bin\\ollama.exe."""
    fake_localappdata = tmp_path / "LocalAppData"
    ylj_bin = fake_localappdata / "YourLocalJared" / "bin"
    ylj_bin.mkdir(parents=True)
    user_ollama = ylj_bin / "ollama.exe"
    user_ollama.write_text("")

    monkeypatch.setattr(server.shutil, "which", lambda _n: None)
    monkeypatch.setattr(server.sys, "platform", "win32")
    monkeypatch.setenv("LOCALAPPDATA", str(fake_localappdata))

    assert server._resolve_ollama() == str(user_ollama)


def test_windows_classic_installer_paths_still_work(monkeypatch, tmp_path):
    """If the user-local dir is empty but the classic winget/installer
    path has ollama, we should still find it there."""
    fake_localappdata = tmp_path / "LocalAppData"
    programs_bin = fake_localappdata / "Programs" / "Ollama"
    programs_bin.mkdir(parents=True)
    classic_ollama = programs_bin / "ollama.exe"
    classic_ollama.write_text("")

    monkeypatch.setattr(server.shutil, "which", lambda _n: None)
    monkeypatch.setattr(server.sys, "platform", "win32")
    monkeypatch.setenv("LOCALAPPDATA", str(fake_localappdata))
    # Make sure ProgramFiles is set so the secondary fallback in the
    # resolver doesn't NoneType on the unset env var.
    monkeypatch.setenv("ProgramFiles", str(tmp_path / "ProgramFiles"))

    assert server._resolve_ollama() == str(classic_ollama)


def test_bare_name_is_last_resort(monkeypatch):
    """If nothing resolves we return the bare name so subprocess raises
    a clear FileNotFoundError later rather than us silently swallowing."""
    monkeypatch.setattr(server.shutil, "which", lambda _n: None)
    monkeypatch.setattr(server.sys, "platform", "linux")
    # Point HOME somewhere that doesn't contain the user-local prefix.
    monkeypatch.setattr(server.Path, "home", classmethod(lambda cls: Path(os.devnull).parent))
    assert server._resolve_ollama() == "ollama"
