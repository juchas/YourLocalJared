"""FastAPI server exposing an OpenAI-compatible chat completions endpoint.

Open WebUI connects to this as if it were an OpenAI API.
Includes an onboarding wizard at /setup for first-time configuration.
"""

import json
import subprocess
import threading
import time
import uuid
from pathlib import Path

import psutil
import torch
import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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
def probe():
    """Detailed hardware probe for the onboarding wizard."""
    return probe_hardware()


@app.get("/api/setup/ollama-status")
def ollama_status():
    """Check whether the Ollama daemon is reachable and list pulled models."""
    return ollama_status_check()


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

            # Download embedding model
            _setup_status["message"] = (
                f"Downloading embedding model ({config.embedding_model})..."
            )
            download_snippet = (
                "from sentence_transformers import SentenceTransformer; "
                f"SentenceTransformer({json.dumps(config.embedding_model)})"
            )
            subprocess.run(
                [python_cmd, "-c", download_snippet],
                check=True, capture_output=True,
            )

            # Pull LLM via Ollama
            _setup_status["message"] = (
                f"Pulling LLM ({config.llm_model}) via Ollama... This may take a while."
            )
            subprocess.run(
                ["ollama", "pull", config.llm_model],
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


# ── OpenAI-compatible API ────────────────────────────────
class Message(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "local-rag"
    messages: list[Message]
    temperature: float | None = None
    max_tokens: int | None = None
    stream: bool = False


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[dict]
    usage: dict


@app.get("/v1/models")
def list_models():
    """List available models (Open WebUI calls this)."""
    return {
        "object": "list",
        "data": [
            {
                "id": "local-rag",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "local",
            }
        ],
    }


@app.post("/v1/chat/completions")
def chat_completions(request: ChatCompletionRequest):
    """OpenAI-compatible chat completions endpoint."""
    # Use the last user message as the query
    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        return {"error": "No user message found"}

    question = user_messages[-1].content
    result = query(question)

    # Format sources as a footnote
    sources_text = ""
    seen = set()
    for s in result["sources"]:
        key = s["source"]
        if key not in seen:
            seen.add(key)
            page_info = f" (p.{s['page']})" if s.get("page") else ""
            sources_text += f"\n- {key}{page_info}"

    answer = result["answer"]
    if sources_text:
        answer += f"\n\n---\n**Sources:**{sources_text}"

    return ChatCompletionResponse(
        id=f"chatcmpl-{uuid.uuid4().hex[:8]}",
        created=int(time.time()),
        model=LLM_MODEL,
        choices=[
            {
                "index": 0,
                "message": {"role": "assistant", "content": answer},
                "finish_reason": "stop",
            }
        ],
        usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    )


def main():
    uvicorn.run("ylj.server:app", host=SERVER_HOST, port=SERVER_PORT, reload=True)


if __name__ == "__main__":
    main()
