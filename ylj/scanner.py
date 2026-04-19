"""Path-safe directory scanner for the onboarding folder picker.

Enumeration is confined to $HOME so the API surface can't be abused to
walk the host filesystem (the server binds 0.0.0.0 by default). Per-folder
work is capped on three axes so a large tree (e.g. ~/Projects with 18k
files) can't stall the UI.

Reuses ``ylj.documents.SKIP_DIRS`` and ``_should_skip`` for gitignore-
style filtering so the scan agrees with what ingest would process.
"""

from __future__ import annotations

import hashlib
import time
from collections import Counter
from pathlib import Path

from ylj.documents import SKIP_DIRS, _should_skip

# Folders we surface by default on the onboarding screen if they exist.
SUGGESTED_FOLDER_NAMES = [
    "Documents",
    "Desktop",
    "Downloads",
    "iCloud Drive/Documents",
    "OneDrive",
    "Projects",
]


def safe_home_path(raw: str) -> Path:
    """Resolve ``raw`` under ``$HOME``; raise ``ValueError`` if it escapes.

    Follows symlinks via ``resolve(strict=False)`` so a symlink to /etc
    still gets rejected by the relative-to-home check at the end. We
    route all ``~`` expansion through ``Path.home()`` directly rather
    than ``expanduser()`` — the latter reads ``$HOME`` and ignores any
    test-time monkeypatch of ``Path.home``.
    """
    if not raw or not raw.strip():
        raise ValueError("path is empty")
    raw = raw.strip()
    home = Path.home().resolve()
    if raw.startswith("~"):
        suffix = raw[1:].lstrip("/")
        expanded = home / suffix if suffix else home
    elif Path(raw).is_absolute():
        expanded = Path(raw)
    else:
        expanded = home / raw
    try:
        resolved = expanded.resolve(strict=False)
    except (OSError, RuntimeError) as e:
        raise ValueError(f"could not resolve path: {e}") from e
    try:
        resolved.relative_to(home)
    except ValueError as e:
        raise ValueError("path escapes home") from e
    return resolved


def suggested_folders(home: Path | None = None) -> list[Path]:
    """Return the subset of ``SUGGESTED_FOLDER_NAMES`` that exist on disk."""
    base = home or Path.home()
    out = []
    for name in SUGGESTED_FOLDER_NAMES:
        candidate = base / name
        if candidate.exists() and candidate.is_dir():
            out.append(candidate)
    return out


def _path_id(path: Path) -> str:
    return hashlib.sha1(str(path).encode()).hexdigest()[:8]


def _display_path(path: Path, home: Path | None = None) -> str:
    base = home or Path.home()
    try:
        rel = path.relative_to(base)
        return f"~/{rel}" if str(rel) != "." else "~"
    except ValueError:
        return str(path)


def scan_folder(
    path: Path,
    *,
    file_cap: int = 50_000,
    depth_cap: int = 12,
    time_budget_s: float = 2.0,
) -> dict:
    """Walk ``path`` with directory-level pruning, bounded by all three caps.

    Pruning at the directory level (not at rglob time) is important: a
    ``node_modules`` with 20k nested files should be a single skip, not
    20k filtered iterations.
    """
    deadline = time.monotonic() + time_budget_s
    file_count = 0
    total_bytes = 0
    extensions: Counter[str] = Counter()
    warn: str | None = None
    root_depth = len(path.parts)

    stack: list[tuple[Path, int]] = [(path, 0)]
    while stack:
        if time.monotonic() > deadline:
            warn = "scan incomplete — time budget hit"
            break
        curr, depth = stack.pop()
        if depth > depth_cap:
            continue
        try:
            entries = list(curr.iterdir())
        except (OSError, PermissionError):
            continue
        for entry in entries:
            if _should_skip(entry):
                continue
            try:
                if entry.is_symlink():
                    continue  # don't follow symlinks; they can escape
                if entry.is_dir():
                    stack.append((entry, depth + 1))
                    continue
                if not entry.is_file():
                    continue
                stat = entry.stat()
            except (OSError, PermissionError):
                continue
            file_count += 1
            total_bytes += stat.st_size
            extensions[entry.suffix.lower()] += 1
            if file_count >= file_cap:
                warn = f"heavy — {file_cap:,}+ files"
                stack.clear()
                break

    del root_depth  # reserved for future per-subtree reporting
    return {
        "id": _path_id(path),
        "path": _display_path(path),
        "files": file_count,
        "sizeGB": round(total_bytes / (1024**3), 2),
        "selected": True,
        "warn": warn,
        "extensions": dict(extensions),
    }


def list_folders() -> dict:
    """Scan the suggested-folder set and return the ``/api/setup/folders`` body.

    Never raises. Per-folder errors bubble out as ``warn`` + ``files=0``.
    """
    folders = []
    for p in suggested_folders():
        try:
            folders.append(scan_folder(p))
        except Exception as e:  # defensive — any scan failure gets a warn row
            folders.append({
                "id": _path_id(p),
                "path": _display_path(p),
                "files": 0,
                "sizeGB": 0.0,
                "selected": False,
                "warn": f"scan failed: {e.__class__.__name__}",
                "extensions": {},
            })
    return {"folders": folders, "ignores": sorted(SKIP_DIRS)}
