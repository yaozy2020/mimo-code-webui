#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RESTART=false
CLEAN_POISONED_CONFIG=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --restart)
      RESTART=true
      ;;
    --clean-poisoned-config)
      CLEAN_POISONED_CONFIG=true
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/run-source.sh [--restart] [--clean-poisoned-config]

Runs a source checkout with explicit diagnostics for the common NAS/local
deployment path. It separates the WebUI workspace allowlist from the base
`mimo serve` cwd so broad workspace access does not force `mimo serve` to run
from `/`.

Environment defaults:
  HOST=0.0.0.0
  PORT=8090
  MIMO_HOST=127.0.0.1
  MIMO_PORT=4096
  MIMO_WORKSPACE_ROOT=/
  MIMO_SERVE_CWD=<parent of this repository>

Flags:
  --restart                 Stop listeners on PORT and MIMO_PORT before start.
  --clean-poisoned-config   Remove legacy/generated config files known to
                            shadow ~/.config/mimocode/mimocode.jsonc.
EOF
      exit 0
      ;;
    *)
      echo "Error: unknown option $1" >&2
      exit 1
      ;;
  esac
  shift
done

cd "$PROJECT_DIR"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8090}"
export MIMO_HOST="${MIMO_HOST:-127.0.0.1}"
export MIMO_PORT="${MIMO_PORT:-4096}"
export MIMO_WORKSPACE_ROOT="${MIMO_WORKSPACE_ROOT:-/}"
export MIMO_SERVE_CWD="${MIMO_SERVE_CWD:-$(dirname "$PROJECT_DIR")}"
if [ -z "${MIMO_CONFIG_PATH:-}" ] && [ -f "$HOME/.config/mimocode/mimocode.jsonc" ]; then
  export MIMO_CONFIG_PATH="$HOME/.config/mimocode/mimocode.jsonc"
fi

if [ "$HOST" != "127.0.0.1" ] && [ "$HOST" != "localhost" ] && [ -z "${AUTH_TOKEN:-}" ] && [ "${ALLOW_UNAUTHENTICATED_LAN:-false}" != "true" ]; then
  echo "Error: AUTH_TOKEN is required when HOST=$HOST. Set AUTH_TOKEN or use HOST=127.0.0.1." >&2
  exit 1
fi

if [ ! -r "$PROJECT_DIR" ] || [ ! -x "$PROJECT_DIR" ]; then
  echo "Error: current user cannot read and enter $PROJECT_DIR" >&2
  exit 1
fi

if [ ! -d "$MIMO_SERVE_CWD" ] || [ ! -r "$MIMO_SERVE_CWD" ] || [ ! -x "$MIMO_SERVE_CWD" ]; then
  echo "Error: MIMO_SERVE_CWD must be a readable directory: $MIMO_SERVE_CWD" >&2
  exit 1
fi

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  for pattern in \
    "$HOME/.nvm/versions/node/*/bin/node" \
    "$HOME/.fnm/node-versions/*/installation/bin/node" \
    "/var/apps/nodejs_v24/target/bin/node" \
    "/var/apps/nodejs_*/target/bin/node" \
    "/usr/local/bin/node" \
    "/usr/bin/node"; do
    for path in $pattern; do
      if [ -x "$path" ]; then
        echo "$path"
        return 0
      fi
    done
  done
  return 1
}

NODE_BIN="$(find_node)" || {
  echo "Error: Node.js 18+ is required and was not found." >&2
  exit 1
}
export PATH="$(dirname "$NODE_BIN"):$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not available after adding $(dirname "$NODE_BIN") to PATH." >&2
  exit 1
fi

if ! command -v mimo >/dev/null 2>&1; then
  echo "Error: mimo CLI is not available on PATH." >&2
  exit 1
fi

stop_port() {
  local port="$1"
  local pids=""
  if command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u | tr '\n' ' ')"
  fi
  if [ -z "$pids" ] && command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
  fi
  if [ -n "$pids" ]; then
    echo "[run-source] stopping port $port: $pids"
    kill $pids 2>/dev/null || true
    sleep 2
  fi
}

if [ "$CLEAN_POISONED_CONFIG" = "true" ]; then
  rm -f "$HOME/.mimo/mimo.config.json" "$HOME/.config/mimocode/config.json"
  export MIMO_LEGACY_CONFIG_PATH="${MIMO_LEGACY_CONFIG_PATH:-$HOME/.config/mimocode/.disabled-legacy-config.json}"
  echo "[run-source] removed legacy/generated config files; mimocode.jsonc remains the source of truth"
fi

if [ "$RESTART" = "true" ]; then
  stop_port "$PORT"
  stop_port "$MIMO_PORT"
fi

echo "[run-source] user=$(id -un) group=$(id -gn)"
echo "[run-source] project=$PROJECT_DIR"
echo "[run-source] node=$NODE_BIN ($($NODE_BIN --version))"
echo "[run-source] npm=$(command -v npm) ($(npm --version))"
echo "[run-source] mimo=$(command -v mimo) ($(mimo --version))"
echo "[run-source] HOST=$HOST PORT=$PORT"
echo "[run-source] MIMO_HOST=$MIMO_HOST MIMO_PORT=$MIMO_PORT"
echo "[run-source] MIMO_WORKSPACE_ROOT=$MIMO_WORKSPACE_ROOT"
echo "[run-source] MIMO_SERVE_CWD=$MIMO_SERVE_CWD"
echo "[run-source] MIMO_CONFIG_PATH=${MIMO_CONFIG_PATH:-$HOME/.config/mimocode/config.json}"

exec ./scripts/start.sh
