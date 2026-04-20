"""FastAPI server for YourLocalJared.

Hosts the onboarding wizard at `/setup`, the chat UI at `/chat`, and the
endpoints they call. There is no external client — everything runs locally
and the two HTML pages are the only consumers.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from ipaddress import ip_address
from pathlib import Path

import psutil
import torch
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ylj import scanner
from ylj.config import EMBEDDING_DIMENSION, EMBEDDING_MODEL, LLM_MODEL, SERVER_HOST, SERVER_PORT
from ylj.llm import status as ollama_status_check
from ylj.probe import probe as probe_hardware
from ylj.rag import query, query_stream


def _resolve_ollama() -> str:
    """Find ollama.exe even if PATH hasn't been refreshed post-install."""
    found = shutil.which("ollama")
    if found:
        return found
    if sys.platform == "win32":
        for candidate in (
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Ollama" / "ollama.exe",
            Path(os.environ.get("ProgramFiles", "")) / "Ollama" / "ollama.exe",
        ):
            if candidate.exists():
                return str(candidate)
    return "ollama"  # let subprocess raise FileNotFoundError with the bare name


def _ensure_ollama_running(timeout_s: float = 8.0) -> bool:
    """Best-effort: start the Ollama daemon if it isn't already up.

    Returns True if the daemon is reachable on return. The installer
    drops `ollama` on $PATH but doesn't start the daemon — that bites
    first-run on macOS especially, where users see "could not connect
    to ollama server" the moment they hit /api/setup/apply. We spawn
    `ollama serve` detached from this process (no inherited fds, new
    session) so it survives beyond the current request, then poll
    status until it accepts connections.
    """
    if ollama_status_check().get("running"):
        return True
    try:
        kwargs = {
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        # start_new_session detaches on POSIX; Windows uses a flag instead.
        if sys.platform == "win32":
            kwargs["creationflags"] = (
                subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
                | getattr(subprocess, "DETACHED_PROCESS", 0)
            )
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen([_resolve_ollama(), "serve"], **kwargs)
    except (FileNotFoundError, OSError):
        return False

    # Edge case: if a previous `ollama serve` is alive but temporarily
    # unresponsive, the new Popen will die on EADDRINUSE immediately and
    # the polling loop will time out against the stuck original process —
    # resulting in a misleading "Could not start" error even though Ollama
    # is installed. Low probability; no special handling, just documented.
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if ollama_status_check().get("running"):
            return True
        time.sleep(0.25)
    return False


app = FastAPI(title="YourLocalJared RAG API")

STATIC_DIR = Path(__file__).parent / "static"

app.mount("/src", StaticFiles(directory=STATIC_DIR / "src"), name="src")


@app.middleware("http")
async def no_cache_jsx(request: Request, call_next):
    """Disable browser cache for JSX files; chat.html loads them without
    version hashes, so stale copies stick forever in dev otherwise."""
    response = await call_next(request)
    if request.url.path.startswith("/src/"):
        response.headers["Cache-Control"] = "no-store"
    return response

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


def _is_loopback_request(request: Request) -> bool:
    """Guards endpoints that would be dangerous to expose on the LAN
    (path-accepting, long-running). The peer IP is the real security
    barrier — a non-loopback peer means the request crossed the network.
    The Host header check is just DNS-rebinding defence-in-depth, so it
    allows the names users actually type into the address bar, including
    ``0.0.0.0`` (what our startup banner prints)."""
    def peer_ok(host: str | None) -> bool:
        if host is None:
            return False
        try:
            return ip_address(host).is_loopback
        except ValueError:
            return False

    def host_header_ok(host: str | None) -> bool:
        if host is None:
            return False
        try:
            addr = ip_address(host)
            return addr.is_loopback or addr == ip_address("0.0.0.0")
        except ValueError:
            return host in {"localhost"}

    client_host = request.client.host if request.client else None
    return peer_ok(client_host) and host_header_ok(request.url.hostname)


@app.get("/api/setup/probe")
def probe(request: Request):
    """Detailed hardware probe for the onboarding wizard (localhost only)."""
    if not _is_loopback_request(request):
        raise HTTPException(status_code=403, detail="probe endpoint is localhost only")
    return probe_hardware()


@app.get("/api/setup/ollama-status")
def ollama_status():
    """Check whether the Ollama daemon is reachable and list pulled models."""
    return ollama_status_check()


@app.get("/api/config")
def runtime_config():
    """Expose the resolved runtime config so the UI never hardcodes model ids."""
    return {
        "llm_model": LLM_MODEL,
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dimension": EMBEDDING_DIMENSION,
    }


@app.get("/api/setup/folders")
def folders_endpoint():
    """Return suggested home-dir folders (scanned) + default ignore patterns."""
    return scanner.list_folders()


class ScanFolderRequest(BaseModel):
    path: str


class RevealRequest(BaseModel):
    path: str


@app.post("/api/reveal")
def reveal_endpoint(body: RevealRequest, request: Request):
    """Open the OS file manager with the given path selected.

    Triple-guarded:
      1. Loopback-only — this spawns a subprocess based on a
         user-supplied path, same as /api/setup/apply.
      2. ``scanner.safe_home_path`` rejects anything outside $HOME
         (path-traversal guard).
      3. The path must appear in the ingest manifest — i.e. we only
         reveal files the index already knows about, never an arbitrary
         $HOME file. Keeps this from being a generic filesystem probe
         if any future code path exposes it less carefully.
    """
    if not _is_loopback_request(request):
        raise HTTPException(status_code=403, detail="reveal endpoint is localhost only")

    try:
        safe = scanner.safe_home_path(body.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Manifest gate — never reveal arbitrary files, only indexed ones.
    # Imported lazily so the import graph stays the same as before and
    # the chat code path doesn't pay for this.
    from ylj.ingest import load_manifest

    manifest = load_manifest()
    if str(safe) not in manifest:
        raise HTTPException(
            status_code=403,
            detail="path is not in the ingest manifest",
        )

    if not safe.exists():
        raise HTTPException(status_code=404, detail="file no longer exists on disk")

    from ylj import reveal as reveal_mod

    try:
        reveal_mod.reveal_in_folder(safe)
    except FileNotFoundError as e:
        # The platform reveal command isn't on PATH (very rare — xdg-open
        # missing on a headless Linux box, for instance).
        raise HTTPException(
            status_code=500,
            detail=f"reveal command not available: {e}",
        ) from e

    return {"status": "ok"}


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


@app.post("/api/setup/apply")
def apply_setup(config: SetupConfig, request: Request):
    """Save configuration to .env and trigger model downloads. Ingestion is
    handled separately by `/api/setup/ingest` (step 07 in the wizard).

    Localhost only — this endpoint writes `.env` and spawns subprocesses
    (Ollama pull + sentence-transformers download), neither of which should
    be reachable from the LAN given the server defaults to binding 0.0.0.0
    for the onboarding flow.
    """
    if not _is_loopback_request(request):
        raise HTTPException(status_code=403, detail="apply endpoint is localhost only")
    global _setup_status
    project_root = Path(__file__).parent.parent
    env_path = project_root / ".env"

    lines = [
        f"YLJ_LLM_MODEL={config.llm_model}",
        f"YLJ_EMBEDDING_MODEL={config.embedding_model}",
        f"YLJ_EMBEDDING_DIMENSION={config.embedding_dimension}",
    ]
    env_path.write_text("\n".join(lines) + "\n")

    # Start model download in background
    _setup_status = {"done": False, "message": "Downloading embedding model..."}

    def download_models():
        global _setup_status
        try:
            venv_python = next(
                (p for p in (
                    project_root / ".venv" / "Scripts" / "python.exe",
                    project_root / ".venv" / "bin" / "python",
                ) if p.exists()),
                None,
            )
            python_cmd = str(venv_python) if venv_python else sys.executable

            # Embedding model: skip the download if HuggingFace already
            # has it cached. SentenceTransformer() loads instantly from
            # the cache anyway, but spawning a subprocess is still ~1s
            # wasted and the log message misleads the user.
            hf_slug = "models--" + config.embedding_model.replace("/", "--")
            hf_cache = Path.home() / ".cache" / "huggingface" / "hub" / hf_slug
            if hf_cache.exists():
                _setup_status["message"] = (
                    f"Embedding model ({config.embedding_model}) already cached "
                    "— skipping download."
                )
            else:
                # Pass the ID as argv so a crafted value can't break out
                # of the `python -c` string — the endpoint is unauth'd
                # and the server binds 0.0.0.0 by default.
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

            # Make sure the Ollama daemon is up before we talk to it.
            # The installer drops `ollama` on $PATH but doesn't start the
            # daemon; without this, the pull below fails with "could not
            # connect to ollama server" on a brand-new install.
            _setup_status["message"] = "Starting Ollama daemon..."
            if not _ensure_ollama_running():
                raise RuntimeError(
                    "Could not start the Ollama daemon. Run `ollama serve` "
                    "in another terminal and retry."
                )

            # LLM: skip the pull if Ollama already has the tag.
            already_pulled = config.llm_model in ollama_status_check().get("models", [])
            if already_pulled:
                _setup_status["message"] = (
                    f"LLM ({config.llm_model}) already pulled — skipping."
                )
            else:
                _setup_status["message"] = (
                    f"Pulling LLM ({config.llm_model}) via Ollama... This may take a while."
                )
                subprocess.run(
                    [_resolve_ollama(), "pull", "--", config.llm_model],
                    check=True, capture_output=True, timeout=600,
                )

            _setup_status = {"done": True, "message": "ready"}
        except subprocess.CalledProcessError as e:
            # Surface stderr so the user sees what actually failed, not just
            # "exit status 1".
            stderr = (e.stderr or b"").decode(errors="replace").strip()
            detail = stderr.splitlines()[-1] if stderr else str(e)
            _setup_status = {"done": True, "message": f"Error: {detail}"}
        except Exception as e:
            _setup_status = {"done": True, "message": f"Error: {e}"}

    threading.Thread(target=download_models, daemon=True).start()
    return {"status": "ok"}


@app.get("/api/setup/status")
def setup_status():
    """Check model download progress."""
    return _setup_status


class IngestRequest(BaseModel):
    folders: list[str]
    extensions: list[str] | None = None
    rebuild: bool = False


@app.post("/api/setup/ingest")
def setup_ingest(body: IngestRequest, request: Request):
    """Stream real progress events from the ingest pipeline as ndjson.

    Each newline-delimited JSON line is one event: rebuild / scan / prune /
    parse / embed / store / done / error. The wizard's step-07 animation
    consumes these to drive its phase indicator, file log, and counters.
    ``rebuild: true`` forces a full re-embed (drops manifest + collection)."""
    if not _is_loopback_request(request):
        raise HTTPException(status_code=403, detail="ingest endpoint is localhost only")

    safe_dirs: list[Path] = []
    for raw in body.folders:
        try:
            safe_dirs.append(scanner.safe_home_path(raw))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"unsafe path {raw!r}: {e}") from e

    if not safe_dirs:
        raise HTTPException(status_code=400, detail="no folders provided")

    ext = {e.lower() for e in body.extensions} if body.extensions else None

    from ylj.ingest import ingest_stream

    def event_stream():
        for ev in ingest_stream(safe_dirs, ext, rebuild=body.rebuild):
            yield (json.dumps(ev) + "\n").encode("utf-8")

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


# ── Chat API (used by ylj/static/chat.html) ─────────────
class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    model: str | None = None
    k: int | None = None
    stream: bool = False


def _source_id(file: str, page: int | None) -> str:
    return hashlib.sha1(f"{file}#{page}".encode()).hexdigest()[:8]


SNIPPET_MAX_CHARS = 400


def _decorate_sources(raw: list[dict]) -> list[dict]:
    return [
        {
            "id": _source_id(s["source"], s.get("page")),
            "file": s["source"],
            "page": s.get("page"),
            "score": s.get("score"),
            # Preview-sized snippet for the chat's sources panel. Keep it
            # short so sending 3–10 sources over SSE doesn't balloon the
            # payload; the LLM already saw the full chunk for generation.
            "snippet": (s.get("text") or "")[:SNIPPET_MAX_CHARS].strip() or None,
        }
        for s in raw or []
    ]


def _sse_encode(event: dict) -> bytes:
    return f"data: {json.dumps(event)}\n\n".encode("utf-8")


@app.post("/api/chat")
def chat(request: ChatRequest):
    """Answer the last user message using local RAG + Ollama.

    Non-streaming by default. When ``stream: true`` is set, returns an
    SSE stream of `retrieval` / `token` / `done` / `error` events so the
    chat UI can render tokens live.
    """
    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="no user message")

    question = user_messages[-1].content
    model = request.model or LLM_MODEL

    if request.stream:
        def _iter():
            try:
                for ev in query_stream(question, top_k=request.k, model=model):
                    if ev.get("event") == "retrieval":
                        ev = {**ev, "sources": _decorate_sources(ev.get("sources", []))}
                    yield _sse_encode(ev)
            except Exception as e:
                # Any exception that escapes query_stream still gets surfaced
                # to the UI as an event rather than a dropped connection.
                yield _sse_encode({"event": "error", "message": str(e)})

        return StreamingResponse(
            _iter(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        result = query(question, top_k=request.k, model=model)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {
        "answer": result.get("answer", ""),
        "sources": _decorate_sources(result.get("sources", [])),
        "model": model,
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def main():
    uvicorn.run("ylj.server:app", host=SERVER_HOST, port=SERVER_PORT, reload=True)


if __name__ == "__main__":
    main()
