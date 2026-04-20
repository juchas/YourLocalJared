"""Reveal a file in the native OS file manager.

The chat UI and the ingest log surface real file paths from the user's
corpus. Clicking them should *not* open the document — the user's
mental model is "show me where it lives" — so we invoke the
platform's reveal-with-selection command instead:

  macOS    → ``open -R <path>``          Finder opens with the file highlighted
  Windows  → ``explorer /select,<path>`` Explorer opens with the file selected
  Linux    → ``xdg-open <parent>``       opens the containing directory
             (cross-DE "select" support is too fragmented to target reliably)

The subprocess is spawned fully detached so the FastAPI request returns
immediately and the file manager's lifecycle is independent of the server.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def _detached_popen(argv: list[str]) -> None:
    """Launch ``argv`` detached from this process.

    No inherited stdio, new process group / session so the child survives
    a server restart and doesn't tie up pipes if the file manager is
    slow to come up.
    """
    kwargs: dict = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = (
            subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
            | getattr(subprocess, "DETACHED_PROCESS", 0)
        )
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(argv, **kwargs)


def reveal_in_folder(path: Path) -> None:
    """Open the OS file manager with ``path`` selected (or its parent).

    ``path`` must already exist and be a file the caller deems safe to
    point the file manager at — this function does no validation of its
    own. Raises ``FileNotFoundError`` only if the underlying command is
    missing on ``PATH``; any other subprocess failure is silent because
    the file manager's own error reporting is the right surface for the
    user to see.
    """
    p = str(path)
    if sys.platform == "darwin":
        _detached_popen(["open", "-R", p])
    elif sys.platform == "win32":
        # The peculiar syntax is literal: `/select,` with no space,
        # then the target path as one token. Because we use the array
        # form of Popen (no shell), paths with spaces don't need quoting.
        _detached_popen(["explorer.exe", f"/select,{p}"])
    else:
        # Linux / BSD / everything else: no reliable "select in file
        # manager" across GNOME/KDE/Xfce/others, so fall back to simply
        # opening the parent directory.
        _detached_popen(["xdg-open", str(path.parent)])
