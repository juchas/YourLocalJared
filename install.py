#!/usr/bin/env python3
"""YourLocalJared project setup.

Cross-platform (Windows, macOS, Linux). Stdlib-only — no third-party
imports at module top. Expects Python >= 3.10 and runs inside a cloned
repo (pyproject.toml + ylj/ next to this script).

Steps:
  1. Assert Python >= 3.10.
  2. Create .venv (idempotent).
  3. Upgrade pip + install the project in editable mode with [dev] extras.
  4. Copy .env.example -> .env if missing.
  5. mkdir -p documents/.
  6. Ping the Ollama daemon (urllib, 2s timeout) and report status.
  7. Warm the default embedding model cache (skip if already cached).
  8. Print platform-aware "how to start" instructions.

If you already have Python 3.10+ + the repo cloned, running this file
directly is the minimum install:  `python install.py`
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MIN_PYTHON = (3, 10)
DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
OLLAMA_URL = "http://localhost:11434/api/version"
IS_WINDOWS = platform.system() == "Windows"


# ── Logging helpers ─────────────────────────────────────────────────
def _supports_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if IS_WINDOWS:
        # Windows Terminal + VS Code terminal + modern PowerShell handle ANSI.
        return bool(os.environ.get("WT_SESSION") or os.environ.get("TERM_PROGRAM"))
    return sys.stdout.isatty()


_COLORS = {"info": "\033[34m", "ok": "\033[32m", "warn": "\033[33m", "err": "\033[31m"}
_RESET = "\033[0m"


def log(level: str, msg: str) -> None:
    tag = {"info": "INFO", "ok": "OK  ", "warn": "WARN", "err": "FAIL"}[level]
    if _supports_color():
        print(f"{_COLORS[level]}[{tag}]{_RESET}  {msg}", flush=True)
    else:
        print(f"[{tag}]  {msg}", flush=True)


def fail(msg: str, code: int = 1) -> None:
    log("err", msg)
    sys.exit(code)


# ── Step 1: Python version ──────────────────────────────────────────
def check_python() -> None:
    v = sys.version_info
    if (v.major, v.minor) < MIN_PYTHON:
        fail(f"Python >= {MIN_PYTHON[0]}.{MIN_PYTHON[1]} required; got {v.major}.{v.minor}.")
    log("ok", f"Python {v.major}.{v.minor}.{v.micro} ({sys.executable})")


# ── Step 2 + 3: venv + dependency install ──────────────────────────
def venv_python_path(venv_dir: Path) -> Path:
    if IS_WINDOWS:
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def create_or_reuse_venv(venv_dir: Path) -> Path:
    vpy = venv_python_path(venv_dir)
    cfg = venv_dir / "pyvenv.cfg"
    if cfg.exists() and vpy.exists():
        log("ok", f"Reusing existing venv at {venv_dir}")
        return vpy
    if venv_dir.exists():
        log("warn", f"{venv_dir} exists but is incomplete — removing")
        shutil.rmtree(venv_dir)
    log("info", f"Creating venv at {venv_dir}…")
    subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
    if not vpy.exists():
        fail(f"venv creation did not produce {vpy}")
    log("ok", f"Created venv at {venv_dir}")
    return vpy


def install_project(vpy: Path) -> None:
    log("info", "Upgrading pip…")
    subprocess.run([str(vpy), "-m", "pip", "install", "--upgrade", "pip", "--quiet"], check=True)
    log("info", 'Installing project with [dev] extras (may take a few minutes)…')
    subprocess.run(
        [str(vpy), "-m", "pip", "install", "-e", ".[dev]", "--quiet"],
        cwd=str(ROOT), check=True,
    )
    log("ok", "Project dependencies installed")


# ── Step 4: .env ────────────────────────────────────────────────────
def seed_dotenv() -> None:
    env = ROOT / ".env"
    sample = ROOT / ".env.example"
    if env.exists():
        log("ok", ".env already exists — leaving it")
        return
    if not sample.exists():
        log("warn", "No .env.example found; skipping .env creation")
        return
    shutil.copy2(sample, env)
    log("ok", f"Created .env from .env.example at {env}")


# ── Step 5: documents/ ──────────────────────────────────────────────
def ensure_documents_dir() -> None:
    docs = ROOT / "documents"
    docs.mkdir(exist_ok=True)
    log("ok", f"Documents directory ready at {docs}")


# ── Step 6: Ollama status ───────────────────────────────────────────
def check_ollama() -> None:
    ollama_bin = shutil.which("ollama")
    if not ollama_bin:
        log("warn", "ollama binary not found on PATH.")
        log("warn", "  Install from https://ollama.com (or run the bootstrap script again).")
        log("warn", "  Onboarding will prompt you to pull the model after ollama is up.")
        return
    log("ok", f"ollama binary found at {ollama_bin}")
    try:
        req = urllib.request.Request(OLLAMA_URL)
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                log("ok", "ollama daemon is running")
                return
            log("warn", f"ollama daemon returned HTTP {resp.status}")
    except urllib.error.URLError:
        log("warn", "ollama is installed but the daemon isn't running.")
        if IS_WINDOWS:
            log("warn", "  Start it from the Ollama menu app, or run: ollama serve")
        elif platform.system() == "Darwin":
            log("warn", "  Start it with: brew services start ollama  (or open the Ollama app)")
        else:
            log("warn", "  Start it with: sudo systemctl start ollama  (or run: ollama serve)")


# ── Step 7: embedding model warm-up ─────────────────────────────────
def warm_embedding_cache(vpy: Path, model_id: str = DEFAULT_EMBEDDING_MODEL) -> None:
    hf_slug = "models--" + model_id.replace("/", "--")
    hf_cache = Path.home() / ".cache" / "huggingface" / "hub" / hf_slug
    if hf_cache.exists():
        log("ok", f"Embedding model ({model_id}) already cached — skipping download")
        return
    log("info", f"Pre-downloading embedding model ({model_id})… may take a minute on first run.")
    snippet = (
        "import sys; "
        "from sentence_transformers import SentenceTransformer; "
        "SentenceTransformer(sys.argv[1])"
    )
    try:
        subprocess.run(
            [str(vpy), "-c", snippet, model_id],
            check=True,
            cwd=str(ROOT),
        )
    except subprocess.CalledProcessError as e:
        log("warn", f"Embedding pre-download failed ({e}); onboarding will retry.")
        return
    log("ok", "Embedding model downloaded")


# ── Step 8: how-to-start ────────────────────────────────────────────
def print_next_steps(venv_dir: Path) -> None:
    print()
    bar = "═" * 56
    if _supports_color():
        print(f"{_COLORS['ok']}{bar}{_RESET}")
        print(f"{_COLORS['ok']}  YourLocalJared is ready!{_RESET}")
        print(f"{_COLORS['ok']}{bar}{_RESET}")
    else:
        print(bar)
        print("  YourLocalJared is ready!")
        print(bar)
    print()
    print("  Start the server:")
    if IS_WINDOWS:
        print(f"    {venv_dir}\\Scripts\\Activate.ps1   # PowerShell")
        print(f"    {venv_dir}\\Scripts\\activate.bat   # cmd.exe")
        print("    python start.py")
    else:
        print(f"    source {venv_dir}/bin/activate")
        print("    python start.py")
    print()
    print("  Then open in your browser:")
    print("    http://localhost:8000/setup   — onboarding (hardware probe, model pick, folders)")
    print("    http://localhost:8000/chat    — chat with your local model")
    print()
    print("  To ingest documents headlessly:")
    print("    python start.py --ingest --dir ./documents")
    print()


# ── main ────────────────────────────────────────────────────────────
def main() -> None:
    log("info", f"Platform: {platform.system()} {platform.release()} ({platform.machine()})")
    check_python()
    venv_dir = ROOT / ".venv"
    vpy = create_or_reuse_venv(venv_dir)
    install_project(vpy)
    seed_dotenv()
    ensure_documents_dir()
    check_ollama()
    warm_embedding_cache(vpy)
    print_next_steps(venv_dir)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        fail(f"Subprocess failed with exit {e.returncode}: {' '.join(map(str, e.cmd))}")
    except KeyboardInterrupt:
        fail("Interrupted.", code=130)
