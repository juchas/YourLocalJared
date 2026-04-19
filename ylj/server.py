"""FastAPI server for YourLocalJared.

Hosts the onboarding wizard at `/setup`, the chat UI at `/chat`, and the
endpoints they call. There is no external client — everything runs locally
and the two HTML pages are the only consumers.
"""

import hashlib
import subprocess
import threading
from ipaddress import ip_address
from pathlib import Path

import psutil
import torch
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ylj import scanner
from ylj.config import LLM_MODEL, SERVER_HOST, SERVER_PORT
from ylj.llm import status as ollama_status_check
from ylj.probe import probe as probe_hardware
from ylj.rag import query

app = FastAPI(title="YourLocalJared RAG API")

STATIC_DIR = Path(__file__).parent / "static"

app.mount("/src", StaticFiles(directory=STATIC_DIR / "src"), name="src")

# ── Setup state (for tracking model downloads) ──────────
_setup_status = {"done": True, "message": "idle"}


# ── Onboarding routes ───────────────────────────────────
@app.get("/")
def root():
    """Redirect root to setup page."""
    return RedirectResponse(url="/setup")


@app.get("/setup")
def setup_page():
    """Serve the onboarding wizard."""
    return FileResponse(STATIC_DIR / "onboarding.html")


@app.get("/chat")
def chat_page():
    """Serve the chat UI."""
    return FileResponse(STATIC_DIR / "chat.html")


@app.get("/api/setup/system-info")
def system_info():
    """Detect system RAM and compute device."""
    ram_gb = round(psutil.virtual_memory().total / (1024**3))
    device = "cpu"
    if torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    return {"ram_gb": ram_gb, "device": device}


@app.get("/api/setup/probe")
def probe(request: Request):
    """Detailed hardware probe for the onboarding wizard (localhost only)."""
    client_host = request.client.host if request.client else None
    request_host = request.url.hostname

    def is_loopback_host(host: str | None) -> bool:
        if host is None:
            return False
        try:
            return ip_address(host).is_loopback
        except ValueError:
            return host in {"localhost", "127.0.0.1", "::1"}

    # Guard on both transport peer and request host. This avoids relying
    # solely on request.client.host, which may be loopback behind a reverse proxy.
    is_loopback = is_loopback_host(client_host) and is_loopback_host(request_host)

    if not is_loopback:
        raise HTTPException(status_code=403, detail="probe endpoint is localhost only")

    return probe_hardware()


@app.get("/api/setup/ollama-status")
def ollama_status():
    """Check whether the Ollama daemon is reachable and list pulled models."""
    return ollama_status_check()


@app.get("/api/setup/folders")
def folders_endpoint():
    """Return suggested home-dir folders (scanned) + default ignore patterns."""
    return scanner.list_folders()


class ScanFolderRequest(BaseModel):
    path: str


@app.post("/api/setup/scan-folder")
def scan_folder_endpoint(body: ScanFolderRequest):
    """Scan a user-provided path (must resolve under $HOME)."""
    try:
        safe = scanner.safe_home_path(body.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return scanner.scan_folder(safe)


class SetupConfig(BaseModel):
    llm_model: str
    embedding_model: str
    embedding_dimension: int
    documents_dir: str


@app.post("/api/setup/apply")
def apply_setup(config: SetupConfig):
    """Save configuration to .env and trigger model downloads."""
    global _setup_status
    project_root = Path(__file__).parent.parent
    env_path = project_root / ".env"

    # Write .env
    lines = [
        f"YLJ_LLM_MODEL={config.llm_model}",
        f"YLJ_EMBEDDING_MODEL={config.embedding_model}",
        f"YLJ_EMBEDDING_DIMENSION={config.embedding_dimension}",
        f"YLJ_DOCUMENTS_DIR={config.documents_dir}",
    ]
    env_path.write_text("\n".join(lines) + "\n")

    # Start model download in background
    _setup_status = {"done": False, "message": "Downloading embedding model..."}

    def download_models():
        global _setup_status
        try:
            venv_python = project_root / ".venv" / "bin" / "python"
            python_cmd = str(venv_python) if venv_python.exists() else "python"

            # Download embedding model. Pass the ID as argv so a crafted
            # value can't break out of the `python -c` string — the endpoint
            # is unauth'd and the server binds 0.0.0.0 by default.
            _setup_status["message"] = (
                f"Downloading embedding model ({config.embedding_model})..."
            )
            download_snippet = (
                "import sys; from sentence_transformers import SentenceTransformer; "
                "SentenceTransformer(sys.argv[1])"
            )
            subprocess.run(
                [python_cmd, "-c", download_snippet, config.embedding_model],
                check=True, capture_output=True,
            )

            # Pull LLM via Ollama
            _setup_status["message"] = (
                f"Pulling LLM ({config.llm_model}) via Ollama... This may take a while."
            )
            subprocess.run(
                ["ollama", "pull", "--", config.llm_model],
                check=True, capture_output=True, timeout=600,
            )

            # Ingest documents from the configured folder
            doc_dir = Path(config.documents_dir)
            if doc_dir.exists() and any(doc_dir.iterdir()):
                _setup_status["message"] = f"Ingesting documents from {doc_dir}..."
                subprocess.run(
                    [python_cmd, "-m", "ylj.ingest", "--dir", str(doc_dir)],
                    check=True, capture_output=True,
                    cwd=str(project_root),
                )

            _setup_status = {"done": True, "message": "ready"}
        except Exception as e:
            _setup_status = {"done": True, "message": f"Error: {e}"}

    threading.Thread(target=download_models, daemon=True).start()
    return {"status": "ok"}


@app.get("/api/setup/status")
def setup_status():
    """Check model download progress."""
    return _setup_status


# ── Chat API (used by ylj/static/chat.html) ─────────────
class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    model: str | None = None


def _source_id(file: str, page: int | None) -> str:
    return hashlib.sha1(f"{file}#{page}".encode()).hexdigest()[:8]


@app.post("/api/chat")
def chat(request: ChatRequest):
    """Answer the last user message using local RAG + Ollama."""
    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="no user message")

    try:
        result = query(user_messages[-1].content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    sources = [
        {
            "id": _source_id(s["source"], s.get("page")),
            "file": s["source"],
            "page": s.get("page"),
            "score": s.get("score"),
            "snippet": None,
        }
        for s in result.get("sources", [])
    ]
    return {
        "answer": result.get("answer", ""),
        "sources": sources,
        "model": LLM_MODEL,
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def main():
    uvicorn.run("ylj.server:app", host=SERVER_HOST, port=SERVER_PORT, reload=True)


if __name__ == "__main__":
    main()
