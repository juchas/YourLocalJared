#!/usr/bin/env python3
"""Single entrypoint to start the entire YourLocalJared RAG system."""

import argparse


def main():
    parser = argparse.ArgumentParser(description="Start YourLocalJared RAG system")
    parser.add_argument("--ingest", action="store_true", help="Ingest documents before starting")
    parser.add_argument("--dir", type=str, default=None, help="Document directory to ingest")
    args = parser.parse_args()

    # 1. Ingest documents if requested
    if args.ingest:
        from pathlib import Path
        from ylj.config import DOCUMENTS_DIR
        from ylj.ingest import ingest

        doc_dir = Path(args.dir) if args.dir else DOCUMENTS_DIR
        print(f"\n=== Ingesting documents from {doc_dir} ===")
        ingest(doc_dir)

    # 2. Start the RAG API server
    from ylj.config import SERVER_HOST, SERVER_PORT
    print(f"\n=== Starting RAG server on {SERVER_HOST}:{SERVER_PORT} ===")
    print("API docs at http://localhost:8000/docs")
    print("Connect Open WebUI to http://localhost:8000/v1\n")

    import uvicorn
    uvicorn.run("ylj.server:app", host=SERVER_HOST, port=SERVER_PORT)


if __name__ == "__main__":
    main()
