#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="/x/know/.env"

load_env_value() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
  fi
}

export GOOGLE_API_KEY="${GOOGLE_API_KEY:-$(load_env_value GOOGLE_API_KEY || true)}"
export GOOGLE_SEARCH_ENGINE_ID="${GOOGLE_SEARCH_ENGINE_ID:-$(load_env_value GOOGLE_SEARCH_ENGINE_ID || true)}"

exec node "$SCRIPT_DIR/google_search.js" "$@"
