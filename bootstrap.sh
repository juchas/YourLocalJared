#!/usr/bin/env bash
# YourLocalJared — curl-pipe bootstrap for macOS and Linux.
#
# One-paste install from a clean VM:
#
#   curl -fsSL https://raw.githubusercontent.com/juchas/YourLocalJared/main/bootstrap.sh | bash
#
# Installs git + Python 3.12 + Ollama using the platform's native package
# manager (Homebrew on macOS; apt / dnf / pacman on Linux), clones the
# repo to $YLJ_INSTALL_DIR (default: $HOME/YourLocalJared), then hands
# off to `python install.py`.
#
# Re-runnable: every step is idempotent. If you already cloned the repo
# and are running this from inside it, the clone step is skipped.

set -euo pipefail

REPO_URL="https://github.com/juchas/YourLocalJared"
INSTALL_DIR="${YLJ_INSTALL_DIR:-$HOME/YourLocalJared}"

# ── Colors ──────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'; NC=$'\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; BLUE=""; NC=""
fi
info()  { printf "%s[INFO]%s  %s\n" "$BLUE"  "$NC" "$*"; }
ok()    { printf "%s[OK]%s    %s\n" "$GREEN" "$NC" "$*"; }
warn()  { printf "%s[WARN]%s  %s\n" "$YELLOW" "$NC" "$*"; }
fail()  { printf "%s[FAIL]%s  %s\n" "$RED"   "$NC" "$*"; exit 1; }

have()  { command -v "$1" >/dev/null 2>&1; }

# ── OS detect ───────────────────────────────────────────────────────
OS="$(uname -s)"
info "OS: $OS $(uname -r) ($(uname -m))"

# ── macOS path: Homebrew ────────────────────────────────────────────
install_homebrew_if_missing() {
    if have brew; then
        ok "Homebrew already installed ($(brew --prefix))"
        return
    fi
    # brew can live in either of these; neither is on PATH until we eval shellenv.
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [ -x "$candidate" ]; then
            eval "$("$candidate" shellenv)"
            ok "Homebrew found at $candidate"
            return
        fi
    done
    info "Installing Homebrew (will prompt for your sudo password once)…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Pick up brew on PATH in this shell session.
    if [ -x /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    else
        fail "Homebrew installation did not land in a known location."
    fi
    ok "Homebrew installed"
}

setup_macos() {
    install_homebrew_if_missing
    info "Installing git + python@3.12 + ollama via Homebrew (idempotent)…"
    NONINTERACTIVE=1 brew install git python@3.12 ollama
    ok "macOS system packages ready"
    if ! pgrep -xq ollama; then
        info "Starting ollama LaunchAgent…"
        brew services start ollama >/dev/null || warn "brew services start ollama failed (continuing)"
    fi
}

# ── Linux path: apt / dnf / pacman ──────────────────────────────────
setup_linux() {
    if have apt-get; then
        info "Detected apt-get. Installing git + python3.12 + curl (will prompt for sudo)…"
        sudo apt-get update
        sudo apt-get install -y git python3.12 python3.12-venv python3-pip curl \
            || sudo apt-get install -y git python3 python3-venv python3-pip curl
    elif have dnf; then
        info "Detected dnf. Installing git + python3 + curl (will prompt for sudo)…"
        sudo dnf install -y git python3 python3-pip curl
    elif have pacman; then
        info "Detected pacman. Installing git + python + curl (will prompt for sudo)…"
        sudo pacman -Syu --noconfirm git python python-pip curl
    else
        fail "Unsupported Linux distro: no apt-get, dnf, or pacman found. Install git + Python 3.10+, then run: python3 install.py"
    fi
    ok "Linux system packages ready"

    if have ollama; then
        ok "ollama already installed ($(ollama --version 2>/dev/null | head -1 || echo 'unknown version'))"
    else
        info "Installing ollama via official script…"
        curl -fsSL https://ollama.com/install.sh | sh
        ok "ollama installed"
    fi
    # systemd unit is enabled by the official installer; nudge it in case it's not up yet.
    if have systemctl && ! curl -s --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then
        sudo systemctl start ollama 2>/dev/null || warn "could not start ollama via systemctl (continuing)"
    fi
}

case "$OS" in
    Darwin) setup_macos ;;
    Linux)  setup_linux ;;
    *)      fail "Unsupported OS: $OS (only Darwin/Linux for this script; use bootstrap.ps1 on Windows)" ;;
esac

# ── Clone (or reuse) the repo ───────────────────────────────────────
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
if [ -n "$script_dir" ] && [ -f "$script_dir/pyproject.toml" ] && [ -d "$script_dir/ylj" ]; then
    # In-repo run: bootstrap.sh is sitting next to pyproject.toml.
    REPO_DIR="$script_dir"
    ok "Running from inside the cloned repo at $REPO_DIR — skipping git clone"
elif [ -d "$INSTALL_DIR/.git" ]; then
    info "Repo already cloned at $INSTALL_DIR — fetching latest main…"
    git -C "$INSTALL_DIR" fetch origin main --quiet
    git -C "$INSTALL_DIR" checkout main --quiet
    git -C "$INSTALL_DIR" pull --ff-only origin main --quiet || warn "git pull reported no fast-forward"
    REPO_DIR="$INSTALL_DIR"
    ok "Updated existing clone at $REPO_DIR"
else
    info "Cloning $REPO_URL into $INSTALL_DIR…"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
    REPO_DIR="$INSTALL_DIR"
    ok "Cloned to $REPO_DIR"
fi

# ── Hand off to install.py ──────────────────────────────────────────
# Pick the Python binary we just installed, not whatever happens to be first on PATH.
if have python3.12; then
    PY=python3.12
elif have python3; then
    PY=python3
elif have python; then
    PY=python
else
    fail "Python interpreter not found after install — try opening a new shell and running: python3 install.py"
fi

info "Running project setup with $PY install.py in $REPO_DIR…"
cd "$REPO_DIR"
exec "$PY" install.py
