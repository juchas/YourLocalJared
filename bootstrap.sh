#!/usr/bin/env bash
# YourLocalJared — curl-pipe bootstrap for macOS and Linux.
#
# One-paste install from a clean VM:
#
#   curl -fsSL https://raw.githubusercontent.com/juchas/YourLocalJared/main/bootstrap.sh | bash
#
# At the top we ask whether you can grant admin/sudo:
#
#   1)  Yes — use Homebrew / apt / dnf / pacman (faster)
#   2)  No  — install Ollama + the repo into your home dir, no sudo touched
#   3)  I'm not sure
#
# Non-interactive overrides (highest wins):
#   YLJ_INSTALL_MODE=system|user     env var
#   --mode system|user               CLI flag
#   stdin is not a TTY               → default to "user"
#   ~/.YourLocalJared/install-mode   remembered from a previous run
#
# Re-runnable: every step is idempotent. If you already cloned the repo
# and are running this from inside it, the clone step is skipped.

set -euo pipefail

REPO_URL="https://github.com/juchas/YourLocalJared"
REPO_TARBALL_URL="${REPO_URL}/archive/refs/heads/main.tar.gz"
INSTALL_DIR="${YLJ_INSTALL_DIR:-$HOME/YourLocalJared}"

# Per-user install prefix for no-admin mode. Mirrors the fallback path
# that `ylj/server.py::_resolve_ollama` looks in, so the server finds
# our ollama even without a PATH reshuffle.
USER_PREFIX="$HOME/.local/ylj"
USER_BIN="$USER_PREFIX/bin"
USER_PYTHON_DIR="$USER_PREFIX/python"

MODE_MARKER_DIR="$HOME/.YourLocalJared"
MODE_MARKER_FILE="$MODE_MARKER_DIR/install-mode"

# Pinned Ollama release tag — `latest` is convenient but the asset-name
# scheme has drifted across versions, so we target one we've tested.
OLLAMA_TAG="v0.3.14"

# Pinned python-build-standalone release. Bump by updating both values.
# Release tag is a YYYYMMDD date; the version is the CPython version
# that tag ships. See https://github.com/astral-sh/python-build-standalone/releases
PBS_DATE="20241016"
PBS_VERSION="3.12.7"

# ── Colors ──────────────────────────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; BLUE=""; BOLD=""; NC=""
fi
info()  { printf "%s[INFO]%s  %s\n" "$BLUE"  "$NC" "$*"; }
ok()    { printf "%s[OK]%s    %s\n" "$GREEN" "$NC" "$*"; }
warn()  { printf "%s[WARN]%s  %s\n" "$YELLOW" "$NC" "$*"; }
fail()  { printf "%s[FAIL]%s  %s\n" "$RED"   "$NC" "$*"; exit 1; }

have()  { command -v "$1" >/dev/null 2>&1; }

# ── SHA256 verification helpers ─────────────────────────────────────
# We hash every downloaded binary against the checksum the upstream
# release published. A mismatch aborts the install — we won't silently
# run an unexpected binary. Linux ships `sha256sum`, macOS ships
# `shasum -a 256`; we detect whichever is available.
_sha256_of() {
    if have sha256sum;   then sha256sum "$1" | awk '{print $1}'
    elif have shasum;    then shasum -a 256 "$1" | awk '{print $1}'
    else fail "No sha256sum or shasum available — cannot verify downloads."
    fi
}

# Verify $1 matches $2 (expected hex). Fails with a clear diff on mismatch.
_verify_sha256() {
    local file="$1" expected="$2"
    if [ -z "$expected" ]; then
        fail "Missing expected SHA256 for $file — refusing to run unverified binary."
    fi
    local actual
    actual=$(_sha256_of "$file")
    if [ "$actual" != "$expected" ]; then
        fail $'SHA256 mismatch for '"$file"$':\n  expected: '"$expected"$'\n  actual:   '"$actual"$'\nAborting install — the download may be corrupted or tampered with.'
    fi
    ok "Verified SHA256 of $(basename "$file")"
}

# ── Arg parsing ─────────────────────────────────────────────────────
# We accept a couple of flags the CLI-pipe path needs. Both are also
# available via env vars so `YLJ_SKIP_DISCLAIMER=1 curl … | bash` works.
MODE=""
SKIP_DISCLAIMER="${YLJ_SKIP_DISCLAIMER:-}"

while [ $# -gt 0 ]; do
    case "$1" in
        --mode)
            shift
            case "${1:-}" in
                system|user) MODE="$1" ;;
                *) fail "--mode must be 'system' or 'user'" ;;
            esac
            shift
            ;;
        --mode=*)
            val="${1#--mode=}"
            case "$val" in
                system|user) MODE="$val" ;;
                *) fail "--mode= must be 'system' or 'user'" ;;
            esac
            shift
            ;;
        --yes|-y)
            # Accept the disclaimer without showing it. For CI and
            # second-degree automation only. The interactive flow never
            # takes this path.
            SKIP_DISCLAIMER=1
            shift
            ;;
        *) break ;;
    esac
done

# ── Disclaimer ──────────────────────────────────────────────────────
# Every interactive run shows the disclaimer; we deliberately don't
# persist an "accepted" marker so users re-consent on every install.
# The countdown exists so "spam Enter to dismiss" isn't a viable way
# to skip reading — Accept/Decline only unlock after READ_DELAY seconds.
READ_DELAY=8

show_disclaimer_and_require_accept() {
    if [ -n "$SKIP_DISCLAIMER" ]; then
        info "Disclaimer skipped (YLJ_SKIP_DISCLAIMER / --yes set)."
        return 0
    fi
    # Non-interactive pipelines (no TTY at all) also bypass — they
    # couldn't meaningfully answer anyway. The server runs only under
    # explicit human consent via the interactive path OR --yes.
    if [ ! -t 0 ]; then
        info "No TTY attached; skipping disclaimer. Re-run interactively to review it."
        return 0
    fi

    printf '\n'
    printf '%s═══════════════════════════════════════════════════════════════════%s\n' "$BOLD" "$NC"
    printf '%s  YourLocalJared — please read before continuing%s\n' "$BOLD" "$NC"
    printf '%s═══════════════════════════════════════════════════════════════════%s\n' "$BOLD" "$NC"
    printf '\n'
    printf '  This installer will:\n'
    printf '\n'
    printf '    1. Install git, Python 3.12, and Ollama — via your system\n'
    printf '       package manager (with admin) or into your home directory\n'
    printf '       (without admin, ~/.local/ylj/).\n'
    printf '    2. Clone YourLocalJared to %s.\n' "$INSTALL_DIR"
    printf '    3. Create a Python venv, install project dependencies, and\n'
    printf '       pre-download a ~140 MB embedding model from Hugging Face.\n'
    printf '    4. Pull a local LLM via Ollama (~2–15 GB depending on which\n'
    printf '       one you pick in the onboarding wizard).\n'
    printf '    5. Start a server at http://localhost:8000. You choose which\n'
    printf '       folders on this machine the tool will index. Those files\n'
    printf '       are chunked, embedded, and stored in ./qdrant_data/ next\n'
    printf '       to the repo.\n'
    printf '\n'
    printf '  %sNothing you index, query, or say in chat leaves this machine.%s\n' "$BOLD" "$NC"
    printf '  All inference runs against your local Ollama daemon.\n'
    printf '\n'
    printf '  Typical disk usage: 10–15 GB including the model and index.\n'
    printf '\n'
    printf '  To uninstall later, delete:\n'
    printf '    • %s  (repo + venv + qdrant_data)\n' "$INSTALL_DIR"
    printf '    • %s  (user-mode Ollama + Python, if you picked no-admin)\n' "$USER_PREFIX"
    printf '    • ~/.ollama/models/  (pulled models — shared across tools)\n'
    printf '\n'
    printf '%s═══════════════════════════════════════════════════════════════════%s\n' "$BOLD" "$NC"
    printf '\n'

    local i
    for i in $(seq "$READ_DELAY" -1 1); do
        printf "\r  ⏳  %2ds until Accept/Decline unlocks…" "$i"
        sleep 1
    done
    printf "\r  %-60s\r" " "

    while true; do
        printf "  %s[A]%s Accept and continue    %s[D]%s Decline and exit: " "$BOLD" "$NC" "$BOLD" "$NC"
        read -r reply </dev/tty || reply="d"
        case "${reply:-}" in
            a|A|y|Y|accept|ACCEPT|yes|YES)
                ok "Accepted — continuing."
                return 0
                ;;
            d|D|n|N|decline|DECLINE|no|NO|"")
                info "Declined — no changes made. Exiting."
                exit 0
                ;;
            *)
                printf "  Please type 'a' to accept or 'd' to decline.\n"
                ;;
        esac
    done
}

show_disclaimer_and_require_accept

# ── Mode resolution ─────────────────────────────────────────────────
# Env var override.
if [ -z "$MODE" ] && [ -n "${YLJ_INSTALL_MODE:-}" ]; then
    case "$YLJ_INSTALL_MODE" in
        system|user) MODE="$YLJ_INSTALL_MODE" ;;
        *) fail "YLJ_INSTALL_MODE must be 'system' or 'user' (got: $YLJ_INSTALL_MODE)" ;;
    esac
fi

# Remembered from a previous run.
if [ -z "$MODE" ] && [ -r "$MODE_MARKER_FILE" ]; then
    prev=$(head -n1 "$MODE_MARKER_FILE" 2>/dev/null || true)
    case "$prev" in
        system|user) MODE="$prev"; info "Reusing install mode '$MODE' from $MODE_MARKER_FILE" ;;
    esac
fi

# Interactive prompt.
if [ -z "$MODE" ]; then
    if [ -t 0 ]; then
        printf "\n%sCan YourLocalJared use sudo/admin rights for this install?%s\n" "$BOLD" "$NC"
        printf "Admin is recommended for the best experience — faster install, updates via\n"
        printf "the package manager. The no-admin path still installs everything you need.\n"
        printf "\n"
        printf "  %s1)%s Yes — use Homebrew / apt / dnf / pacman (recommended)\n" "$BOLD" "$NC"
        printf "  %s2)%s No — install everything to your home directory (no sudo needed)\n" "$BOLD" "$NC"
        printf "  %s3)%s I'm not sure\n" "$BOLD" "$NC"
        printf "\n"
        printf "[1/2/3, default 3]: "
        read -r choice </dev/tty || choice=3
        case "${choice:-3}" in
            1|y|Y|yes|YES) MODE="system" ;;
            2|n|N|no|NO)   MODE="user" ;;
            3|""|*)        MODE="user" ;;
        esac
    else
        # Piped `curl | bash` with no controlling terminal — pick the safer default.
        MODE="user"
        info "No TTY attached; defaulting to --mode=user."
    fi
fi

info "Install mode: $MODE"

# ── OS detect ───────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"
info "OS: $OS $(uname -r) ($ARCH)"

# ── Shared: ensure Python 3.10+ is available ────────────────────────
# Returns the python command name via stdout.
resolve_python() {
    for candidate in python3.13 python3.12 python3.11 python3.10 python3 python; do
        if have "$candidate"; then
            if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
                printf "%s" "$candidate"
                return 0
            fi
        fi
    done
    return 1
}

# ── SYSTEM path (current behavior) ──────────────────────────────────
install_homebrew_if_missing() {
    if have brew; then
        ok "Homebrew already installed ($(brew --prefix))"
        return
    fi
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [ -x "$candidate" ]; then
            eval "$("$candidate" shellenv)"
            ok "Homebrew found at $candidate"
            return
        fi
    done
    info "Installing Homebrew (will prompt for your sudo password once)…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [ -x /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    else
        fail "Homebrew installation did not land in a known location."
    fi
    ok "Homebrew installed"
}

setup_macos_system() {
    install_homebrew_if_missing
    info "Installing git + python@3.12 + ollama via Homebrew (idempotent)…"
    NONINTERACTIVE=1 brew install git python@3.12 ollama
    ok "macOS system packages ready"
    if ! pgrep -xq ollama; then
        info "Starting ollama LaunchAgent…"
        brew services start ollama >/dev/null || warn "brew services start ollama failed (continuing)"
    fi
}

setup_linux_system() {
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
        fail "Unsupported Linux distro: no apt-get, dnf, or pacman found. Install git + Python 3.10+, then re-run with --mode user."
    fi
    ok "Linux system packages ready"

    if have ollama; then
        ok "ollama already installed ($(ollama --version 2>/dev/null | head -1 || echo 'unknown version'))"
    else
        info "Installing ollama via official script…"
        curl -fsSL https://ollama.com/install.sh | sh
        ok "ollama installed"
    fi
    if have systemctl && ! curl -s --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then
        sudo systemctl start ollama 2>/dev/null || warn "could not start ollama via systemctl (continuing)"
    fi
}

# ── USER path (no admin) ────────────────────────────────────────────
# Download the Ollama binary into $USER_BIN without touching system paths.
# The server's _resolve_ollama() already knows to look here, so we don't
# have to munge the user's shell rc files.

# Look up the expected SHA256 of a specific Ollama release asset from
# the release's sha256sums.txt manifest. Ollama ships this file for
# every tagged release, one line per asset: "<hash>  <filename>".
_ollama_expected_sha256() {
    local asset="$1"
    local sums_url="https://github.com/ollama/ollama/releases/download/${OLLAMA_TAG}/sha256sums.txt"
    local sums
    if ! sums=$(curl -fsSL "$sums_url"); then
        fail "Could not fetch Ollama checksums from $sums_url — refusing to run unverified binary."
    fi
    local hash
    hash=$(printf "%s\n" "$sums" | awk -v f="$asset" '$2==f || $2=="./"f {print $1; exit}')
    if [ -z "$hash" ]; then
        fail "Could not find $asset in $sums_url — refusing to run unverified binary."
    fi
    printf "%s" "$hash"
}

install_ollama_user_macos() {
    if [ -x "$USER_BIN/ollama" ]; then
        ok "ollama already installed at $USER_BIN/ollama"
        return
    fi
    mkdir -p "$USER_BIN"
    info "Downloading Ollama $OLLAMA_TAG (macOS, user-local)…"
    local asset="Ollama-darwin.zip"
    local url="https://github.com/ollama/ollama/releases/download/${OLLAMA_TAG}/${asset}"
    local expected
    expected=$(_ollama_expected_sha256 "$asset")
    local tmp
    tmp=$(mktemp -d)
    trap "rm -rf '$tmp'" RETURN
    if ! curl -fsSL -o "$tmp/ollama.zip" "$url"; then
        fail "Could not download Ollama from $url — check your network and retry."
    fi
    _verify_sha256 "$tmp/ollama.zip" "$expected"
    (cd "$tmp" && unzip -q ollama.zip)
    # The official macOS bundle carries the CLI binary inside the .app.
    local cli="$tmp/Ollama.app/Contents/Resources/ollama"
    if [ ! -x "$cli" ]; then
        # Fallback layout — some releases ship the binary at the top level.
        if [ -x "$tmp/ollama" ]; then cli="$tmp/ollama"
        else fail "Could not find the ollama binary inside the downloaded zip."; fi
    fi
    cp "$cli" "$USER_BIN/ollama"
    chmod +x "$USER_BIN/ollama"
    # Strip Gatekeeper quarantine so the binary runs without a prompt.
    # `xattr -d` errors when the attribute is absent; ignore that.
    xattr -d com.apple.quarantine "$USER_BIN/ollama" 2>/dev/null || true
    ok "Installed ollama at $USER_BIN/ollama"
}

install_ollama_user_linux() {
    if [ -x "$USER_BIN/ollama" ]; then
        ok "ollama already installed at $USER_BIN/ollama"
        return
    fi
    mkdir -p "$USER_BIN"
    local ollama_arch=""
    case "$ARCH" in
        x86_64|amd64)  ollama_arch="amd64" ;;
        aarch64|arm64) ollama_arch="arm64" ;;
        *) fail "Unsupported Linux architecture for user-mode Ollama: $ARCH" ;;
    esac
    info "Downloading Ollama $OLLAMA_TAG (linux-$ollama_arch, user-local)…"
    local asset="ollama-linux-${ollama_arch}.tgz"
    local url="https://github.com/ollama/ollama/releases/download/${OLLAMA_TAG}/${asset}"
    local expected
    expected=$(_ollama_expected_sha256 "$asset")
    local tmp
    tmp=$(mktemp -d)
    trap "rm -rf '$tmp'" RETURN
    if ! curl -fsSL -o "$tmp/ollama.tgz" "$url"; then
        fail "Could not download Ollama from $url — check your network and retry."
    fi
    _verify_sha256 "$tmp/ollama.tgz" "$expected"
    (cd "$tmp" && tar -xzf ollama.tgz)
    # Layout inside the tgz is `bin/ollama` + `lib/ollama/...` (gpu runners).
    # Copy the whole tree so GPU runners stay alongside the CLI.
    if [ -d "$tmp/bin" ] && [ -f "$tmp/bin/ollama" ]; then
        cp -r "$tmp/bin/." "$USER_BIN/"
        [ -d "$tmp/lib" ] && mkdir -p "$USER_PREFIX/lib" && cp -r "$tmp/lib/." "$USER_PREFIX/lib/"
    elif [ -x "$tmp/ollama" ]; then
        cp "$tmp/ollama" "$USER_BIN/ollama"
    else
        fail "Could not find the ollama binary inside the downloaded tgz."
    fi
    chmod +x "$USER_BIN/ollama"
    ok "Installed ollama at $USER_BIN/ollama"
}

# Download a portable Python via python-build-standalone into $USER_PYTHON_DIR
# when the machine doesn't already have a usable system Python. Idempotent:
# re-running with $USER_PYTHON_DIR already populated is a no-op.
install_portable_python_posix() {
    local portable_py="$USER_PYTHON_DIR/bin/python3"
    if [ -x "$portable_py" ]; then
        ok "Portable Python already installed at $portable_py"
        return
    fi
    local pbs_platform=""
    case "$OS:$ARCH" in
        Darwin:arm64)          pbs_platform="aarch64-apple-darwin" ;;
        Darwin:x86_64)         pbs_platform="x86_64-apple-darwin" ;;
        Linux:x86_64|Linux:amd64)   pbs_platform="x86_64-unknown-linux-gnu" ;;
        Linux:aarch64|Linux:arm64)  pbs_platform="aarch64-unknown-linux-gnu" ;;
        *) fail "No portable Python build for $OS/$ARCH. Install Python 3.10+ manually and re-run." ;;
    esac
    local url="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_DATE}/cpython-${PBS_VERSION}+${PBS_DATE}-${pbs_platform}-install_only.tar.gz"
    # python-build-standalone publishes a `.sha256` sidecar per asset,
    # formatted as "<hash>  <filename>" — same shape as `sha256sum`.
    local sha_url="${url}.sha256"
    mkdir -p "$USER_PREFIX"
    info "Downloading portable Python $PBS_VERSION ($pbs_platform)…"
    local tmp
    tmp=$(mktemp -d)
    trap "rm -rf '$tmp'" RETURN
    local expected
    if ! expected=$(curl -fsSL "$sha_url" | awk '{print $1; exit}'); then
        fail "Could not fetch Python checksum from $sha_url — refusing to run unverified binary."
    fi
    if ! curl -fsSL -o "$tmp/python.tgz" "$url"; then
        fail "Could not download portable Python from $url — check your network and retry."
    fi
    _verify_sha256 "$tmp/python.tgz" "$expected"
    # The tarball's top-level is `python/`; extracting into $USER_PREFIX
    # produces $USER_PREFIX/python/bin/python3 exactly where we want it.
    (cd "$USER_PREFIX" && tar -xzf "$tmp/python.tgz")
    if [ ! -x "$portable_py" ]; then
        fail "Portable Python extraction did not produce $portable_py"
    fi
    # Sanity-check the install is usable before we hand off to install.py.
    if ! "$portable_py" -c 'import sys; assert sys.version_info >= (3, 10)' 2>/dev/null; then
        fail "Extracted Python at $portable_py doesn't report >= 3.10 — bailing out."
    fi
    ok "Portable Python ready at $portable_py ($("$portable_py" --version 2>&1))"
}

setup_user_common() {
    # Prefer an existing system Python (fast path). If none meets the
    # version floor, download a portable build — that's the whole point
    # of the no-admin path on clean machines.
    if PYTHON_CMD=$(resolve_python); then
        ok "Using system Python: $PYTHON_CMD ($("$PYTHON_CMD" --version 2>&1))"
    else
        info "Python 3.10+ not found on PATH — installing portable Python into $USER_PYTHON_DIR…"
        install_portable_python_posix
        PYTHON_CMD="$USER_PYTHON_DIR/bin/python3"
    fi
    export YLJ_PYTHON_CMD="$PYTHON_CMD"

    # git is preferred for cloning; tarball fallback handled later.
    if have git; then
        ok "git available: $(git --version)"
    else
        warn "git not found — will fetch the repo as a tarball instead."
    fi
}

setup_macos_user() {
    setup_user_common
    install_ollama_user_macos
    # Start the daemon so the wizard's apply step doesn't trip on first
    # contact. server.py also has _ensure_ollama_running() which spawns
    # it if needed; kicking it here is just a nice-to-have.
    if ! curl -s --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then
        info "Starting Ollama daemon in the background…"
        nohup "$USER_BIN/ollama" serve >/dev/null 2>&1 &
        disown || true
    fi
}

setup_linux_user() {
    setup_user_common
    install_ollama_user_linux
    if ! curl -s --max-time 2 http://localhost:11434/api/version >/dev/null 2>&1; then
        info "Starting Ollama daemon in the background…"
        # Pass OLLAMA_LIBRARY so the daemon finds its sibling runner libs
        # under $USER_PREFIX/lib/ollama.
        if [ -d "$USER_PREFIX/lib/ollama" ]; then
            OLLAMA_LIBRARY="$USER_PREFIX/lib/ollama" \
                nohup "$USER_BIN/ollama" serve >/dev/null 2>&1 &
        else
            nohup "$USER_BIN/ollama" serve >/dev/null 2>&1 &
        fi
        disown || true
    fi
}

# ── Dispatch ────────────────────────────────────────────────────────
case "$OS:$MODE" in
    Darwin:system) setup_macos_system ;;
    Linux:system)  setup_linux_system ;;
    Darwin:user)   setup_macos_user ;;
    Linux:user)    setup_linux_user ;;
    *) fail "Unsupported OS: $OS (only Darwin/Linux for this script; use bootstrap.ps1 on Windows)" ;;
esac

# ── Persist the chosen mode so the next run skips the prompt ────────
mkdir -p "$MODE_MARKER_DIR"
printf "%s\n" "$MODE" > "$MODE_MARKER_FILE"

# ── Clone (or reuse, or tarball-fetch) the repo ─────────────────────
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"

fetch_tarball() {
    # Last-resort clone when git isn't available: grab a tarball of main.
    # We lose `git pull`-based updates until the user installs git; they
    # can always re-run the bootstrap to refresh.
    info "Downloading repo tarball (git not available)…"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    local tmp
    tmp=$(mktemp -d)
    trap "rm -rf '$tmp'" RETURN
    if ! curl -fsSL -o "$tmp/repo.tar.gz" "$REPO_TARBALL_URL"; then
        fail "Could not download repo tarball from $REPO_TARBALL_URL"
    fi
    (cd "$tmp" && tar -xzf repo.tar.gz)
    # GitHub tarballs extract into `YourLocalJared-main/`.
    local extracted
    extracted=$(find "$tmp" -maxdepth 1 -type d -name "YourLocalJared-*" | head -n1)
    [ -n "$extracted" ] || fail "Unexpected tarball layout."
    rm -rf "$INSTALL_DIR"
    mv "$extracted" "$INSTALL_DIR"
    ok "Fetched repo tarball to $INSTALL_DIR"
}

if [ -n "$script_dir" ] && [ -f "$script_dir/pyproject.toml" ] && [ -d "$script_dir/ylj" ]; then
    REPO_DIR="$script_dir"
    ok "Running from inside the cloned repo at $REPO_DIR — skipping fetch"
elif [ -d "$INSTALL_DIR/.git" ]; then
    if have git; then
        info "Repo already cloned at $INSTALL_DIR — fetching latest main…"
        git -C "$INSTALL_DIR" fetch origin main --quiet
        git -C "$INSTALL_DIR" checkout main --quiet
        git -C "$INSTALL_DIR" pull --ff-only origin main --quiet || warn "git pull reported no fast-forward"
    else
        warn "Existing .git checkout but no git binary — leaving repo unchanged."
    fi
    REPO_DIR="$INSTALL_DIR"
    ok "Using existing clone at $REPO_DIR"
elif have git; then
    info "Cloning $REPO_URL into $INSTALL_DIR…"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
    REPO_DIR="$INSTALL_DIR"
    ok "Cloned to $REPO_DIR"
else
    fetch_tarball
    REPO_DIR="$INSTALL_DIR"
fi

# ── Hand off to install.py ──────────────────────────────────────────
# In system mode we let install.py find Python via `sys.executable` as
# before. In user mode we already picked a Python that meets the version
# floor in setup_user_common; pass it through.
if [ "$MODE" = "user" ]; then
    PY="${YLJ_PYTHON_CMD:-python3}"
else
    if have python3.12; then PY=python3.12
    elif have python3;     then PY=python3
    elif have python;      then PY=python
    else fail "Python interpreter not found after install — open a new shell and re-run install.py manually."
    fi
fi

install_args=("install.py" "--mode" "$MODE")
if [ "$MODE" = "user" ]; then
    install_args+=("--ollama-bin" "$USER_BIN/ollama")
fi

info "Running project setup: $PY ${install_args[*]}  (in $REPO_DIR)"
cd "$REPO_DIR"
"$PY" "${install_args[@]}"

# ── Launch the server ──────────────────────────────────────────────
# install.py created / reused a venv at $REPO_DIR/.venv. We exec the
# server under that venv's Python so the caller's shell becomes the
# server process — Ctrl-C stops it, and there's no orphaned shell to
# clean up. Re-runs (repo already set up) take this same path so the
# bootstrap always ends with a running server.
VENV_PY="$REPO_DIR/.venv/bin/python"
if [ ! -x "$VENV_PY" ]; then
    fail "Venv Python not found at $VENV_PY — install.py did not finish cleanly."
fi

printf '\n'
ok "Install complete — launching YourLocalJared."
info "Open http://localhost:8000/setup in your browser (first-time onboarding)."
info "Ctrl-C here will stop the server."
printf '\n'
exec "$VENV_PY" start.py
