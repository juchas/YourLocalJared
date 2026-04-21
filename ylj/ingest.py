"""Document ingestion — parse, chunk, embed, and store.

Exposes `ingest_stream()` (generator yielding progress events, consumed by
the /api/setup/ingest streaming endpoint) and a thin `ingest()` wrapper for
the CLI entry point.

Incremental by default: a ``ingest_manifest.json`` sidecar next to
``qdrant_data/`` records ``(mtime_ns, size)`` for every file that's been
embedded. On re-run we skip untouched files, re-process modified ones
(deleting their old chunks first), and prune files that have disappeared
from the currently scanned roots. ``--rebuild`` drops the manifest + the
collection for a full re-embed.
"""

import argparse
import json
import os
import time
from pathlib import Path
from typing import Iterator

from ylj.config import DOCUMENTS_DIR, PROJECT_ROOT
from ylj.documents import (
    PARSERS,
    SKIP_DIRS,
    SUPPORTED_EXTENSIONS,
    parse_document,
    split_chunks,
)
from ylj.embeddings import get_embedding_model
from ylj.vectorstore import (
    delete_by_source_file,
    drop_collection,
    ensure_collection,
    get_collection_info,
    upsert_chunks,
)

EMBED_BATCH = 64

MANIFEST_VERSION = 1


def _manifest_path() -> Path:
    return PROJECT_ROOT / "ingest_manifest.json"


def _load_manifest() -> dict[str, dict]:
    """Return {path: {"mtime_ns": int, "size": int}} or {} on miss/invalid."""
    p = _manifest_path()
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text())
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict) or data.get("version") != MANIFEST_VERSION:
        return {}
    files = data.get("files")
    if not isinstance(files, dict):
        return {}
    # Light shape validation — keep only entries with both fields.
    clean: dict[str, dict] = {}
    for k, v in files.items():
        if isinstance(k, str) and isinstance(v, dict):
            mt = v.get("mtime_ns")
            sz = v.get("size")
            if isinstance(mt, int) and isinstance(sz, int):
                clean[k] = {"mtime_ns": mt, "size": sz}
    return clean


def load_manifest() -> dict[str, dict]:
    """Public wrapper around ``_load_manifest``."""
    return _load_manifest()


def _save_manifest(files: dict[str, dict]) -> None:
    """Atomic write so a crash mid-flush never leaves a partial file."""
    p = _manifest_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps({"version": MANIFEST_VERSION, "files": files}, indent=2))
    os.replace(tmp, p)


def _stat_tuple(path: Path) -> dict | None:
    try:
        st = path.stat()
    except OSError:
        return None
    return {"mtime_ns": st.st_mtime_ns, "size": st.st_size}


def _partition_files(
    files: list[Path],
    manifest: dict[str, dict],
) -> tuple[list[Path], list[Path]]:
    """Split discovered files into (to_process, to_skip).

    A file is skipped only when its absolute-path key is in the manifest
    *and* both (mtime_ns, size) match the stored entry exactly. Missing
    entry or either field different → re-process.
    """
    to_process: list[Path] = []
    to_skip: list[Path] = []
    for p in files:
        key = str(p)
        entry = manifest.get(key)
        cur = _stat_tuple(p)
        if (
            entry is not None
            and cur is not None
            and entry["mtime_ns"] == cur["mtime_ns"]
            and entry["size"] == cur["size"]
        ):
            to_skip.append(p)
        else:
            to_process.append(p)
    return to_process, to_skip


def _path_under(path: str, roots: list[Path]) -> bool:
    try:
        p = Path(path).resolve()
    except OSError:
        return False
    for r in roots:
        try:
            p.relative_to(r.resolve())
            return True
        except (ValueError, OSError):
            continue
    return False


def _find_orphans(manifest: dict[str, dict], roots: list[Path]) -> list[str]:
    """Manifest entries under one of the scanned roots whose file is gone."""
    orphans: list[str] = []
    for key in manifest:
        if not _path_under(key, roots):
            continue  # leave entries that belong to some other scanned root alone
        if not Path(key).exists():
            orphans.append(key)
    return orphans


def _skip_path(path: Path) -> bool:
    return any(part in SKIP_DIRS or part.endswith(".egg-info") for part in path.parts)


def _enumerate_files(
    dirs: list[Path],
    allowed_exts: set[str],
) -> tuple[list[Path], dict[str, int]]:
    """Single walk of the selected roots.

    Returns:
      files — paths matching ``allowed_exts`` (the set we can actually parse).
      unsupported — ``{ext: count}`` for files under the scanned roots whose
        extension is in :data:`documents.UNSUPPORTED_EXTENSIONS`. Surfaced in
        the scan event so the wizard can tell users "you have 42 .doc files
        we can't index — convert to .docx". We deliberately don't count
        every unknown extension here (noisy); just the known-unsupported
        ones we've documented.
    """
    from ylj.documents import UNSUPPORTED_EXTENSIONS

    seen: set[Path] = set()
    files: list[Path] = []
    unsupported: dict[str, int] = {}
    for d in dirs:
        d = d.expanduser()
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if not p.is_file() or _skip_path(p) or p in seen:
                continue
            seen.add(p)
            suffix = p.suffix.lower()
            if suffix in allowed_exts:
                files.append(p)
            elif suffix in UNSUPPORTED_EXTENSIONS:
                unsupported[suffix] = unsupported.get(suffix, 0) + 1
    return files, unsupported


def ingest_stream(
    dirs: list[Path],
    extensions: set[str] | None = None,
    *,
    rebuild: bool = False,
    prune: bool = True,
) -> Iterator[dict]:
    """Run the ingest pipeline, yielding progress events.

    Per-file parse errors are isolated: one unparseable file (e.g. an
    encrypted PDF, a locked XLSX) yields a ``skip`` event and the run
    continues. Only errors in the pipeline itself (embedding model,
    vector store, enumeration) terminate with an ``error`` event.
    Event shapes:
        {"phase": "rebuild", "reason": str}                # only when rebuild triggers
        {"phase": "scan",    "total_files": int, "skipped": int,
                             "orphans": int, "unsupported": {ext: count}}
        {"phase": "prune",   "file": str, "deleted": int}  # zero or more
        {"phase": "parse",   "file": str, "chunks": int, "ms": int, "files_done": int}
        {"phase": "skip",    "file": str, "reason": str, "files_done": int}
        {"phase": "embed",   "chunks_done": int}
        {"phase": "store",   "chunks_done": int}
        {"phase": "done",    "files": int, "chunks": int, "skipped": int, "pruned": int,
         "failed": int}
        {"phase": "error",   "message": str}

    Where ``total_files`` counts only files that will actually be processed
    this run; ``skipped`` is the number whose (mtime_ns, size) matched the
    manifest and were left as-is. ``total_files + skipped`` equals the
    count of discovered files.
    """
    try:
        allowed = {e.lower() for e in (extensions or SUPPORTED_EXTENSIONS)} & set(PARSERS.keys())

        manifest = _load_manifest()

        # Pre-existing index upgrade: the collection has points from before
        # this feature landed (so they lack the `source_file` payload used
        # by delete_by_source_file) but we have no manifest. A pure
        # incremental run would leave stale chunks around forever on
        # modified files — force a rebuild once so everything lines up.
        if not rebuild and not manifest:
            info = get_collection_info()
            if info and info.get("points_count"):
                yield {
                    "phase": "rebuild",
                    "reason": "pre-incremental index detected; rebuilding once",
                }
                rebuild = True

        if rebuild:
            drop_collection()
            _manifest_path().unlink(missing_ok=True)
            manifest = {}

        ensure_collection()

        files, unsupported = _enumerate_files(dirs, allowed)
        to_process, to_skip = _partition_files(files, manifest)
        orphans = _find_orphans(manifest, dirs) if prune else []

        yield {
            "phase": "scan",
            "total_files": len(to_process),
            "skipped": len(to_skip),
            "orphans": len(orphans),
            # `.doc` / `.rtf` counts so the wizard can surface a
            # "you have N files we can't index" banner. Empty dict
            # when everything is parseable.
            "unsupported": unsupported,
        }

        # Prune orphans before doing any new work, so the index reflects
        # the user's current folder state even if no new files need
        # processing.
        pruned = 0
        for key in orphans:
            delete_by_source_file(key)
            manifest.pop(key, None)
            pruned += 1
            yield {"phase": "prune", "file": key, "deleted": 1}

        if not to_process:
            _save_manifest(manifest)
            yield {
                "phase": "done",
                "files": 0,
                "chunks": 0,
                "skipped": len(to_skip),
                "pruned": pruned,
                "failed": 0,
            }
            return

        model = get_embedding_model()

        buffer: list = []
        total_chunks = 0
        failed = 0

        def flush():
            """Embed + upsert whatever's in `buffer`, yielding phase events."""
            nonlocal buffer
            if not buffer:
                return
            batch = buffer
            buffer = []
            texts = [c.text for c in batch]
            yield {"phase": "embed", "chunks_done": total_chunks}
            embeddings = model.encode(texts, show_progress_bar=False).tolist()
            yield {"phase": "store", "chunks_done": total_chunks}
            upsert_chunks(batch, embeddings)

        for idx, path in enumerate(to_process, start=1):
            key = str(path)
            # Modified files (already in manifest): drop old points first
            # so re-upsert doesn't produce duplicates alongside the stale
            # ones. New files skip this — nothing to delete.
            if key in manifest:
                delete_by_source_file(key)

            t0 = time.perf_counter()
            # Isolate parse failures so one bad file (encrypted PDF,
            # locked spreadsheet, corrupted archive) doesn't take the
            # rest of the corpus down with it.
            try:
                raw = parse_document(path)
                chunked = split_chunks(raw)
            except Exception as e:
                failed += 1
                yield {
                    "phase": "skip",
                    "file": key,
                    "reason": f"{type(e).__name__}: {e}",
                    "files_done": idx,
                }
                continue

            buffer.extend(chunked)
            total_chunks += len(chunked)

            # Record the file in the manifest as soon as it's parsed. The
            # chunks may still be in the buffer waiting to flush, but we
            # capture (mtime_ns, size) now so a concurrent modification
            # is detected on the *next* run rather than silently stamped
            # over here.
            tup = _stat_tuple(path)
            if tup is not None:
                manifest[key] = tup

            yield {
                "phase": "parse",
                "file": key,
                "chunks": len(chunked),
                "ms": int((time.perf_counter() - t0) * 1000),
                "files_done": idx,
            }
            while len(buffer) >= EMBED_BATCH:
                # Carve off exactly one batch so memory stays bounded even
                # when a single file produces many chunks.
                head, buffer = buffer[:EMBED_BATCH], buffer[EMBED_BATCH:]
                texts = [c.text for c in head]
                yield {"phase": "embed", "chunks_done": total_chunks - len(buffer)}
                embeddings = model.encode(texts, show_progress_bar=False).tolist()
                yield {"phase": "store", "chunks_done": total_chunks - len(buffer)}
                upsert_chunks(head, embeddings)

        # Flush the trailing partial batch.
        yield from flush()

        _save_manifest(manifest)

        yield {
            "phase": "done",
            "files": len(to_process) - failed,
            "chunks": total_chunks,
            "skipped": len(to_skip),
            "pruned": pruned,
            "failed": failed,
        }
    except Exception as e:
        # Intentionally don't write the manifest on error — the next run
        # will redo whatever partially landed, which is safer than a
        # stamped-as-current manifest for files that never got stored.
        yield {"phase": "error", "message": str(e)}


def ingest(directory: Path, *, rebuild: bool = False) -> None:
    """CLI wrapper — consume the event stream and print human-readable progress."""
    errored = False
    last_phase = None
    for ev in ingest_stream([directory], rebuild=rebuild):
        phase = ev.get("phase")
        if phase == "rebuild":
            print(f"Rebuild: {ev['reason']}")
        elif phase == "scan":
            parts = [f"{ev['total_files']} files to process"]
            if ev.get("skipped"):
                parts.append(f"{ev['skipped']} unchanged")
            if ev.get("orphans"):
                parts.append(f"{ev['orphans']} orphaned")
            print("Scan: " + ", ".join(parts))
        elif phase == "prune":
            print(f"  pruned {ev['file']}")
        elif phase == "parse":
            print(f"  [{ev['files_done']}] {ev['file']} → {ev['chunks']} chunks ({ev['ms']}ms)")
        elif phase == "skip":
            print(f"  [{ev['files_done']}] skipped {ev['file']}: {ev['reason']}")
        elif phase == "embed" and last_phase != "embed":
            print(f"Embedding chunks (batch starts at {ev.get('chunks_done', 0)})...")
        elif phase == "store" and last_phase != "store":
            print("Storing chunks...")
        elif phase == "done":
            parts = [f"{ev.get('files', 0)} files", f"{ev.get('chunks', 0)} chunks"]
            if ev.get("skipped"):
                parts.append(f"{ev['skipped']} unchanged")
            if ev.get("pruned"):
                parts.append(f"{ev['pruned']} pruned")
            if ev.get("failed"):
                parts.append(f"{ev['failed']} failed")
            print("Done: " + ", ".join(parts) + ".")
        elif phase == "error":
            print(f"Error: {ev['message']}")
            errored = True
        last_phase = phase
    if errored:
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description="Ingest documents into the RAG vector store")
    parser.add_argument(
        "--dir",
        type=Path,
        default=DOCUMENTS_DIR,
        help=f"Directory containing documents (default: {DOCUMENTS_DIR})",
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Drop the collection and ingest manifest before ingesting, re-embedding every file.",
    )
    args = parser.parse_args()
    ingest(args.dir, rebuild=args.rebuild)


if __name__ == "__main__":
    main()
