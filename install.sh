#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
#  YourLocalJared — Full Install Script
#  Installs everything needed to run the local RAG system:
#    - Python virtual environments
#    - Project dependencies
#    - Open WebUI
#    - HuggingFace models (embedding + LLM)
# ─────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
OWUI_VENV_DIR="$ROOT_DIR/.venv-openwebui"
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

# ── Step 5: HuggingFace authentication ───────────────────
info "Checking HuggingFace authentication..."
if hf auth whoami &>/dev/null; then
    HF_USER=$(hf auth whoami 2>/dev/null | head -1)
    ok "Logged in to HuggingFace ($HF_USER)"
else
    warn "Not logged in to HuggingFace."
    echo "    Some models (like Mistral) may require authentication."
    echo "    Run: hf auth login"
    read -rp "    Do you want to log in now? [y/N] " answer
    if [[ "$answer" =~ ^[Yy] ]]; then
        hf auth login
    fi
fi

# ── Step 6: Download embedding model ────────────────────
EMBEDDING_MODEL="BAAI/bge-small-en-v1.5"
info "Downloading embedding model ($EMBEDDING_MODEL)..."
if python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('$EMBEDDING_MODEL')" &>/dev/null; then
    ok "Embedding model ready"
else
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('$EMBEDDING_MODEL')"
    ok "Embedding model downloaded"
fi

# ── Step 7: Download LLM ────────────────────────────────
LLM_MODEL="mistralai/Mistral-7B-Instruct-v0.3"
info "Downloading LLM ($LLM_MODEL)..."
echo "    This is ~15GB and may take a while on first run."
if [ -d "$HOME/.cache/huggingface/hub/models--mistralai--Mistral-7B-Instruct-v0.3/snapshots" ]; then
    SNAP_COUNT=$(find "$HOME/.cache/huggingface/hub/models--mistralai--Mistral-7B-Instruct-v0.3/snapshots" -type f | wc -l | tr -d ' ')
    if [ "$SNAP_COUNT" -gt 5 ]; then
        ok "LLM already downloaded"
    else
        hf download "$LLM_MODEL"
        ok "LLM downloaded"
    fi
else
    hf download "$LLM_MODEL"
    ok "LLM downloaded"
fi

# ── Step 8: Install Open WebUI ───────────────────────────
info "Setting up Open WebUI..."
if [ -d "$OWUI_VENV_DIR" ] && "$OWUI_VENV_DIR/bin/pip" show open-webui &>/dev/null; then
    ok "Open WebUI already installed"
else
    if [ ! -d "$OWUI_VENV_DIR" ]; then
        "$PYTHON" -m venv "$OWUI_VENV_DIR"
    fi
    "$OWUI_VENV_DIR/bin/pip" install --upgrade pip --quiet
    info "Installing Open WebUI (this takes a few minutes)..."
    "$OWUI_VENV_DIR/bin/pip" install open-webui --quiet
    ok "Open WebUI installed"
fi

# ── Done ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  YourLocalJared is ready!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "  To start everything:"
echo "    source .venv/bin/activate"
echo "    python start.py"
echo ""
echo "  To also ingest documents:"
echo "    python start.py --ingest --dir ./documents"
echo ""
echo "  To start Open WebUI (in a separate terminal):"
echo "    WEBUI_NAME=YourLocalJared \\"
echo "    WEBUI_URL=https://github.com/juchas/YourLocalJared \\"
echo "    OPENAI_API_BASE_URL=http://localhost:8000/v1 \\"
echo "    OPENAI_API_KEY=dummy \\"
echo "    WEBUI_AUTH=false \\"
echo "    .venv-openwebui/bin/open-webui serve"
echo ""
echo "  Then open: http://localhost:8080"
echo ""
