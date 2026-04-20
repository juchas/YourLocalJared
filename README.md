# YourLocalJared

A fully local RAG (Retrieval-Augmented Generation) chat that runs on your own machine. Point it at your folders, pick a local model, ask questions.

- **Fully local.** No cloud API, no OpenAI, no Anthropic. LLM inference runs through [Ollama](https://ollama.com); embeddings run via sentence-transformers; vector search is Qdrant in file-based mode.
- **Two pages.** `/setup` is the onboarding wizard (hardware probe, model pick, folder picker, ingest). `/chat` is where you talk to the model.
- **No Docker.** Everything runs against a single FastAPI server on port 8000.

## Requirements

- ~10 GB of disk (for a small model) plus room for your documents
- Admin/sudo rights for the one-time install (Homebrew / apt / winget need them)
- Internet connection during install

Git, Python, and Ollama are **installed for you** on a clean VM by the bootstrap scripts below — you don't need them pre-installed.

## Install

### One-paste install (clean VM)

**macOS or Linux** — paste into Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/juchas/YourLocalJared/main/bootstrap.sh | bash
```

**Windows** — paste into PowerShell:

```powershell
iex (irm https://raw.githubusercontent.com/juchas/YourLocalJared/main/bootstrap.ps1)
```

Both scripts:

1. Install git, Python 3.12, and Ollama via the native package manager (Homebrew on macOS, apt/dnf/pacman on Linux, winget on Windows).
2. Clone the repo to `~/YourLocalJared` (override with `YLJ_INSTALL_DIR`).
3. Create a venv, install project deps, pre-fetch the default embedding model, and ping Ollama.

End-to-end time on a fresh VM: ~8–12 min, most of it waiting on downloads. Every step is idempotent — re-running upgrades in place.

### Already cloned the repo?

```bash
./install.sh           # macOS / Linux
install.bat            # Windows
```

These are thin shims that call the same `bootstrap.sh` / `bootstrap.ps1`, but skip the clone step.

### Already have Python 3.10+ and Ollama?

Skip the bootstrap entirely — `install.py` handles the project setup alone:

```bash
python install.py
```

## Run

```bash
# macOS / Linux
source .venv/bin/activate
python start.py
```

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
python start.py
```

```bat
REM Windows cmd.exe
.venv\Scripts\activate.bat
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
