#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RESTART=false
DAEMON=false
WEBUI_LOG="${WEBUI_LOG:-/tmp/mimo-webui.log}"
PROJECT_KEY="$(printf '%s' "$PROJECT_DIR" | cksum | awk '{print $1}')"
PID_FILE="${WEBUI_PID_FILE:-/tmp/mimo-webui-source-$PROJECT_KEY.pid}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --restart)
      RESTART=true
      ;;
    --daemon)
      DAEMON=true
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/run-source.sh [--daemon] [--restart]

Runs a source checkout with explicit diagnostics for local or server source
deployments. It separates the WebUI workspace allowlist from the base
`mimo serve` cwd so broad workspace access does not force `mimo serve` to run
from `/`.

Environment defaults:
  HOST=127.0.0.1
  PORT=8080
  MIMO_HOST=127.0.0.1
  MIMO_PORT=4096
  MIMO_WORKSPACE_ROOT=<parent of this repository>
  MIMO_SERVE_CWD=<parent of this repository>

Flags:
  --daemon                  Start in the background and write logs to /tmp.
  --restart                 Restart only the WebUI process previously started
                            by this checkout with --daemon. Requires --daemon.
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

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8080}"
export MIMO_HOST="${MIMO_HOST:-127.0.0.1}"
export MIMO_PORT="${MIMO_PORT:-4096}"
export MIMO_SERVE_CWD="${MIMO_SERVE_CWD:-$(dirname "$PROJECT_DIR")}"
export MIMO_WORKSPACE_ROOT="${MIMO_WORKSPACE_ROOT:-$MIMO_SERVE_CWD}"
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

lan_ip() {
  hostname -I 2>/dev/null | tr ' ' '\n' | grep -m1 '^[0-9]' || printf '127.0.0.1\n'
}

process_start_time() {
  awk '{print $22}' "/proc/$1/stat" 2>/dev/null || true
}

stop_owned_webui() {
  [ -f "$PID_FILE" ] || { echo "Error: no owned WebUI PID file at $PID_FILE" >&2; return 1; }
  local pid recorded_start recorded_cwd current_start current_cwd command
  IFS=$'\t' read -r pid recorded_start recorded_cwd < "$PID_FILE"
  [[ "$pid" =~ ^[0-9]+$ ]] || { echo "Error: invalid PID file" >&2; return 1; }
  kill -0 "$pid" 2>/dev/null || { rm -f "$PID_FILE"; echo "Error: recorded WebUI process is not running" >&2; return 1; }
  current_start="$(process_start_time "$pid")"
  current_cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  command="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  if [ "$recorded_start" != "$current_start" ] || [ "$recorded_cwd" != "$current_cwd" ] || [ "$current_cwd" != "$PROJECT_DIR" ] || [[ "$command" != *"server/dist/index.js"* ]]; then
    echo "Error: PID ownership check failed; refusing to stop process $pid" >&2
    return 1
  fi
  kill -TERM "$pid"
  for _ in $(seq 1 30); do
    kill -0 "$pid" 2>/dev/null || { rm -f "$PID_FILE"; return 0; }
    sleep 1
  done
  echo "Error: owned WebUI process $pid did not stop after SIGTERM" >&2
  return 1
}

if [ "$RESTART" = "true" ]; then
  [ "$DAEMON" = "true" ] || { echo "Error: --restart requires --daemon" >&2; exit 1; }
  stop_owned_webui
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

if [ "$DAEMON" = "true" ]; then
  if curl -fsS "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; then
    echo "Error: WebUI port $PORT already serves a healthy instance; refusing to claim it" >&2
    exit 1
  fi
  echo "[run-source] starting WebUI in background; log=$WEBUI_LOG"
  nohup ./scripts/start.sh >"$WEBUI_LOG" 2>&1 &
  webui_pid=$!

  for _ in $(seq 1 30); do
    if ! kill -0 "$webui_pid" >/dev/null 2>&1; then
      echo "Error: WebUI exited during startup. Log follows:" >&2
      tail -n 80 "$WEBUI_LOG" >&2 || true
      exit 1
    fi
    if curl -fsS "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; then
      printf '%s\t%s\t%s\n' "$webui_pid" "$(process_start_time "$webui_pid")" "$PROJECT_DIR" > "$PID_FILE"
      echo "[run-source] WebUI ready on http://127.0.0.1:$PORT (pid $webui_pid)"
      if [ "$HOST" != "127.0.0.1" ] && [ "$HOST" != "localhost" ]; then
        echo "[run-source] LAN URL: http://$(lan_ip):$PORT/"
      fi
      exit 0
    fi
    sleep 1
  done

  echo "Error: WebUI did not become ready on port $PORT. Log follows:" >&2
  tail -n 80 "$WEBUI_LOG" >&2 || true
  exit 1
fi

exec ./scripts/start.sh
