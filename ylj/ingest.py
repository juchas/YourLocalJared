"""Document ingestion — parse, chunk, embed, and store.

Exposes `ingest_stream()` (generator yielding progress events, consumed by
the /api/setup/ingest streaming endpoint) and a thin `ingest()` wrapper for
the CLI entry point.
"""

import argparse
import time
from pathlib import Path
from typing import Iterator

from ylj.config import DOCUMENTS_DIR
from ylj.documents import (
    PARSERS,
    SKIP_DIRS,
    SUPPORTED_EXTENSIONS,
    parse_document,
    split_chunks,
)
from ylj.embeddings import get_embedding_model
from ylj.vectorstore import ensure_collection, upsert_chunks

EMBED_BATCH = 64


def _skip_path(path: Path) -> bool:
    return any(part in SKIP_DIRS or part.endswith(".egg-info") for part in path.parts)


def _enumerate_files(dirs: list[Path], allowed_exts: set[str]) -> list[Path]:
    seen: set[Path] = set()
    files: list[Path] = []
    for d in dirs:
        d = d.expanduser()
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if (
                p.is_file()
                and p.suffix.lower() in allowed_exts
                and not _skip_path(p)
                and p not in seen
            ):
                seen.add(p)
                files.append(p)
    return files


def ingest_stream(
    dirs: list[Path],
    extensions: set[str] | None = None,
) -> Iterator[dict]:
    """Run the ingest pipeline, yielding progress events.

    Event shapes:
        {"phase": "scan",  "total_files": int}
        {"phase": "parse", "file": str, "chunks": int, "ms": int, "files_done": int}
        {"phase": "embed", "batch": int, "batches": int}
        {"phase": "store", "batch": int, "batches": int}
        {"phase": "done",  "files": int, "chunks": int}
        {"phase": "error", "message": str}
    """
    try:
        allowed = {e.lower() for e in (extensions or SUPPORTED_EXTENSIONS)} & set(PARSERS.keys())

        ensure_collection()

        files = _enumerate_files(dirs, allowed)
        yield {"phase": "scan", "total_files": len(files)}

        if not files:
            yield {"phase": "done", "files": 0, "chunks": 0}
            return

        all_chunks = []
        for idx, path in enumerate(files, start=1):
            t0 = time.perf_counter()
            raw = parse_document(path)
            chunked = split_chunks(raw)
            all_chunks.extend(chunked)
            yield {
                "phase": "parse",
                "file": str(path),
                "chunks": len(chunked),
                "ms": int((time.perf_counter() - t0) * 1000),
                "files_done": idx,
            }

        if not all_chunks:
            yield {"phase": "done", "files": len(files), "chunks": 0}
            return

        texts = [c.text for c in all_chunks]
        batches = (len(texts) + EMBED_BATCH - 1) // EMBED_BATCH
        model = get_embedding_model()
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), EMBED_BATCH):
            batch_texts = texts[i : i + EMBED_BATCH]
            batch_emb = model.encode(batch_texts, show_progress_bar=False).tolist()
            all_embeddings.extend(batch_emb)
            yield {
                "phase": "embed",
                "batch": (i // EMBED_BATCH) + 1,
                "batches": batches,
            }

        # upsert_chunks batches internally; surface one store-started + store-done event
        yield {"phase": "store", "batch": 0, "batches": 1}
        upsert_chunks(all_chunks, all_embeddings)
        yield {"phase": "store", "batch": 1, "batches": 1}

        yield {"phase": "done", "files": len(files), "chunks": len(all_chunks)}
    except Exception as e:
        yield {"phase": "error", "message": str(e)}


def ingest(directory: Path) -> None:
    """CLI wrapper — consume the event stream and print human-readable progress."""
    errored = False
    for ev in ingest_stream([directory]):
        phase = ev.get("phase")
        if phase == "scan":
            print(f"Found {ev['total_files']} files to ingest.")
        elif phase == "parse":
            print(f"  [{ev['files_done']}] {ev['file']} → {ev['chunks']} chunks ({ev['ms']}ms)")
        elif phase == "embed":
            print(f"Embedding batch {ev['batch']}/{ev['batches']}")
        elif phase == "store":
            if ev["batch"] == 0:
                print("Storing chunks...")
        elif phase == "done":
            print(f"Done: {ev.get('files', 0)} files, {ev.get('chunks', 0)} chunks.")
        elif phase == "error":
            print(f"Error: {ev['message']}")
            errored = True
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
    args = parser.parse_args()
    ingest(args.dir)


if __name__ == "__main__":
    main()
