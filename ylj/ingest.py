"""Document ingestion CLI — parse, chunk, embed, and store documents."""

import argparse
from pathlib import Path

from ylj.config import DOCUMENTS_DIR
from ylj.documents import load_documents
from ylj.embeddings import embed_texts
from ylj.vectorstore import ensure_collection, upsert_chunks


def ingest(directory: Path):
    """Ingest all documents from a directory into Qdrant."""
    ensure_collection()

    chunks = load_documents(directory)
    if not chunks:
        print("No documents found to ingest.")
        return

    print(f"Embedding {len(chunks)} chunks...")
    texts = [c.text for c in chunks]
    embeddings = embed_texts(texts)

    print("Storing in Qdrant...")
    upsert_chunks(chunks, embeddings)
    print("Ingestion complete.")


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
