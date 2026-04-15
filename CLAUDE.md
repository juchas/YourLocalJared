# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**YourLocalJared** — A fully local RAG (Retrieval-Augmented Generation) system. Users ingest documents (PDF, DOCX, XLSX, PPTX, TXT, MD, CSV), which get chunked, embedded, and stored in Qdrant. Queries go through an OpenAI-compatible API that retrieves relevant chunks and generates answers using a local Mistral model via Hugging Face Transformers.

## Architecture

```
Open WebUI (optional, connects to port 8000)
    ↓ OpenAI-compatible API
FastAPI server (ylj/server.py, port 8000)
    ↓
RAG pipeline (ylj/rag.py)
    ├── Embed query (ylj/embeddings.py) → sentence-transformers
    ├── Vector search (ylj/vectorstore.py) → Qdrant (local file storage)
    └── Generate answer (ylj/llm.py) → Mistral via Transformers
```

- `ylj/config.py` — All settings, driven by env vars (see `.env.example`)
- `ylj/documents.py` — Document parsing (per-format parsers) and chunking
- `ylj/ingest.py` — CLI entrypoint to ingest a directory of documents

## Commands

```bash
# Install the project
pip install -e ".[dev]"

# Start everything (server + optional ingest)
python start.py
python start.py --ingest
python start.py --ingest --dir /path/to/docs

# Or run individual commands
ylj-ingest                    # defaults to ./documents/
ylj-ingest --dir /path/to/docs
ylj-serve

# Lint
ruff check ylj/ tests/

# Run tests
pytest
pytest tests/test_specific.py -k "test_name"
```

## Key Design Decisions

- **No Docker required**: Qdrant runs in local file-based mode (`./qdrant_data/`). Open WebUI is optional and connects to the API server.
- **OpenAI-compatible API**: The server mimics the `/v1/chat/completions` endpoint so Open WebUI connects natively without custom pipes.
- **Transformers (not llama.cpp)**: Using HF Transformers directly for model inference; supports CPU, CUDA, and MPS (Apple Silicon).
- **All config via env vars**: Every setting in `ylj/config.py` can be overridden with `YLJ_` prefixed environment variables.
