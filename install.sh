#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
#  YourLocalJared — Install Script
#  Prepares the project so you can run `python start.py` and
#  finish setup in the browser (model pull, folder picker, etc.).
# ─────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
MIN_PYTHON="3.10"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ── Step 0: Check Python ────────────────────────────────
info "Checking Python version..."
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" &>/dev/null; then
        version=$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
        major=$("$candidate" -c "import sys; print(sys.version_info.major)")
        minor=$("$candidate" -c "import sys; print(sys.version_info.minor)")
        if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
            PYTHON="$candidate"
            break
        fi
    fi
done
[ -z "$PYTHON" ] && fail "Python >= $MIN_PYTHON is required but not found."
ok "Found $PYTHON ($version)"

# ── Step 1: Create project venv ──────────────────────────
info "Setting up project virtual environment..."
if [ -d "$VENV_DIR" ]; then
    warn "Venv already exists at $VENV_DIR — reusing it"
else
    "$PYTHON" -m venv "$VENV_DIR"
    ok "Created $VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
pip install --upgrade pip --quiet

# ── Step 2: Install project dependencies ─────────────────
info "Installing project dependencies (this may take a few minutes)..."
pip install -e ".[dev]" --quiet 2>&1 | grep -v "already satisfied" || true
ok "Project dependencies installed"

# ── Step 3: Create .env if missing ───────────────────────
if [ ! -f "$ROOT_DIR/.env" ]; then
    info "Creating .env from .env.example..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    ok "Created .env — edit it to customize settings"
else
    ok ".env already exists"
fi

# ── Step 4: Create documents directory ───────────────────
mkdir -p "$ROOT_DIR/documents"
ok "Documents directory ready"

# ── Step 5: Check Ollama ─────────────────────────────────
info "Checking for Ollama..."
if command -v ollama &>/dev/null; then
    ok "ollama is installed ($(ollama --version 2>/dev/null | head -1))"
    if command -v curl &>/dev/null; then
        if curl -s --max-time 2 http://localhost:11434/api/version &>/dev/null; then
            ok "ollama daemon is running"
        else
            warn "ollama is installed but the daemon isn't running. Start it with: ollama serve"
        fi
    else
        warn "curl not found; skipping ollama daemon readiness check"
    fi
else
    warn "ollama not found. Install from https://ollama.com — the onboarding wizard will pull the model after."
fi

# ── Step 6: Pre-fetch the default embedding model ────────
# Embeddings still use sentence-transformers (Ollama handles the LLM).
# Grabbing the default now means the first onboarding scan is instant.
EMBEDDING_MODEL="BAAI/bge-small-en-v1.5"
info "Pre-downloading embedding model ($EMBEDDING_MODEL)..."
if python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('$EMBEDDING_MODEL')" &>/dev/null; then
    ok "Embedding model ready"
else
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('$EMBEDDING_MODEL')"
    ok "Embedding model downloaded"
fi

# ── Done ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  YourLocalJared is ready!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "  Start the server:"
echo "    source .venv/bin/activate"
echo "    python start.py"
echo ""
echo "  Then open in your browser:"
echo "    http://localhost:8000/setup   — onboarding (hardware probe, model pick, folders)"
echo "    http://localhost:8000/chat    — chat with your local model"
echo ""
echo "  To ingest documents headlessly:"
echo "    python start.py --ingest --dir ./documents"
echo ""
