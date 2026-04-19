# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**YourLocalJared** — A fully local RAG (Retrieval-Augmented Generation) chat. Users ingest documents (PDF, DOCX, XLSX, PPTX, TXT, MD, CSV), which get chunked, embedded, and stored in Qdrant. Queries hit a local `/api/chat` endpoint that retrieves relevant chunks and generates answers using a model served by the local Ollama daemon. The only UI is the bundled `/setup` + `/chat` pages — there are no external clients.

## Architecture

```
Browser (chat.html, onboarding.html) ─── fetch ──▶ FastAPI server (ylj/server.py, port 8000)
                                                     ↓
                                                   RAG pipeline (ylj/rag.py)
                                                     ├── Embed query (ylj/embeddings.py) → sentence-transformers
                                                     ├── Vector search (ylj/vectorstore.py) → Qdrant (local file storage)
                                                     └── Generate answer (ylj/llm.py) → Ollama HTTP (localhost:11434)
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

- **No Docker required**: Qdrant runs in local file-based mode (`./qdrant_data/`).
- **Single-page chat at `/chat`**: The FastAPI server hosts both the onboarding wizard and the chat UI; there are no external clients. The chat UI calls `POST /api/chat` (purpose-built, not OpenAI-shaped).
- **Ollama for LLM inference**: LLM calls go through the local Ollama daemon (default `http://localhost:11434`, configurable via `YLJ_OLLAMA_HOST`). Setup shells out to `ollama pull` to fetch the chosen model. Embeddings still run via sentence-transformers.
- **All config via env vars**: Every setting in `ylj/config.py` can be overridden with `YLJ_` prefixed environment variables.
