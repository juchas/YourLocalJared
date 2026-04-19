# YourLocalJared

A fully local RAG (Retrieval-Augmented Generation) chat that runs on your own machine. Point it at your folders, pick a local model, ask questions.

- **Fully local.** No cloud API, no OpenAI, no Anthropic. LLM inference runs through [Ollama](https://ollama.com); embeddings run via sentence-transformers; vector search is Qdrant in file-based mode.
- **Two pages.** `/setup` is the onboarding wizard (hardware probe, model pick, folder picker, ingest). `/chat` is where you talk to the model.
- **No Docker.** Everything runs against a single FastAPI server on port 8000.

## Requirements

- Python 3.10+
- [Ollama](https://ollama.com) installed and running locally
- ~10 GB of disk (for a 7B model) plus room for your documents

## Install

```bash
git clone https://github.com/juchas/YourLocalJared.git
cd YourLocalJared
./install.sh
```

The install script sets up a virtual environment, installs deps, checks that Ollama is present, and pre-downloads the default embedding model. It does not download an LLM — that happens in onboarding so you can pick what fits your hardware.

## Run

```bash
source .venv/bin/activate
python start.py
```

Then open in your browser:

- <http://localhost:8000/setup> — onboarding: probe hardware, pick a model, choose folders to index.
- <http://localhost:8000/chat> — chat with your local model, grounded in your documents.

## Architecture

```
Browser (chat.html, onboarding.html) ─── fetch ──▶ FastAPI server (ylj/server.py, port 8000)
                                                     │
                                                     ├── RAG pipeline (ylj/rag.py)
                                                     │   ├── Embed query (ylj/embeddings.py) ─▶ sentence-transformers
                                                     │   ├── Vector search (ylj/vectorstore.py) ─▶ Qdrant (./qdrant_data)
                                                     │   └── Generate answer (ylj/llm.py) ─▶ Ollama HTTP (localhost:11434)
                                                     │
                                                     ├── Hardware probe (ylj/probe.py)
                                                     └── Folder scanner (ylj/scanner.py)
```

## Configuration

All settings are env vars, prefixed `YLJ_`. Defaults live in `ylj/config.py`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `YLJ_OLLAMA_HOST` | `http://localhost:11434` | Ollama daemon URL |
| `YLJ_LLM_MODEL` | `qwen2.5:7b` | LLM tag (set during onboarding) |
| `YLJ_EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | sentence-transformers model |
| `YLJ_DOCUMENTS_DIR` | `./documents` | Root folder for ingest |
| `YLJ_QDRANT_PATH` | `./qdrant_data` | Local Qdrant storage |
| `YLJ_SERVER_HOST` | `0.0.0.0` | FastAPI bind address |
| `YLJ_SERVER_PORT` | `8000` | FastAPI port |

## Development

```bash
# Lint
ruff check ylj/ tests/

# Tests
pytest
```

CI runs both on every push / PR (see `.github/workflows/ci.yml`).

## License

See [LICENSE](LICENSE).
