#!/usr/bin/env bash
# Thin shim so `./install.sh` from a cloned repo root Just Works™.
# The real bootstrap logic lives in bootstrap.sh at the repo root.
set -euo pipefail
exec bash "$(cd "$(dirname "$0")" && pwd)/bootstrap.sh" "$@"
