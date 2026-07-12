#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Use the invoking user's HOME by default. Set MIMO_HOME only when a service
# account must intentionally share a different MiMo config/state directory.
if [ -n "${MIMO_HOME:-}" ]; then
  export HOME="$MIMO_HOME"
fi
export MIMO_CONFIG_PATH="${MIMO_CONFIG_PATH:-$HOME/.config/mimocode/config.json}"
# Use the directory that contains the WebUI project as the default workspace root
# so users can create sessions in sibling directories, not just inside the webui folder.
export MIMO_WORKSPACE_ROOT="${MIMO_WORKSPACE_ROOT:-$(dirname "$PROJECT_DIR")}"
# Optionally keep data/state under the project directory when MIMO_HOME is not writable.
if [ -n "${MIMO_DATA_HOME:-}" ]; then
  export XDG_DATA_HOME="$MIMO_DATA_HOME"
  export XDG_STATE_HOME="${MIMO_STATE_HOME:-$MIMO_DATA_HOME/../state}"
fi

find_node() {
  # Try the current PATH first
  if command -v node &> /dev/null; then
    command -v node
    return 0
  fi

  # Common Node.js installation locations
  local candidates=(
    "$HOME/.nvm/versions/node/*/bin/node"
    "$HOME/.fnm/node-versions/*/installation/bin/node"
    "$HOME/.local/share/fnm/node-versions/*/installation/bin/node"
    "/var/apps/nodejs_v24/target/bin/node"
    "/var/apps/nodejs_*/target/bin/node"
    "/usr/local/bin/node"
    "/usr/bin/node"
    "/opt/node/bin/node"
    "/opt/homebrew/bin/node"
    "/mnt/data/node/bin/node"
  )

  for pattern in "${candidates[@]}"; do
    for path in $pattern; do
      if [ -x "$path" ]; then
        echo "$path"
        return 0
      fi
    done
  done

  return 1
}

NODE_BIN=$(find_node) || {
  echo "Error: Node.js is not installed or not in PATH."
  echo "Please install Node.js 18+ and make sure 'node' is available."
  exit 1
}

echo "[start] using Node.js: $NODE_BIN"

# Make npm available for install/build steps when Node is found outside of PATH
export PATH="$(dirname "$NODE_BIN"):$PATH"

if ! "$NODE_BIN" --version &> /dev/null; then
  echo "Error: $NODE_BIN is not executable."
  exit 1
fi

NODE_MAJOR="$($NODE_BIN -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18+ is required; found $($NODE_BIN --version)."
  exit 1
fi

if [ "${MIMO_WEBUI_STRICT_RELEASE:-false}" = "true" ]; then
  for required_path in "web/dist/index.html" "server/dist/index.js"; do
    if [ ! -f "$required_path" ]; then
      echo "Error: strict release mode requires $required_path. Install a complete release package."
      exit 1
    fi
  done
  if ! "$NODE_BIN" -e 'import("express")' >/dev/null 2>&1; then
    echo "Error: strict release mode requires installed production dependencies. Run npm ci --omit=dev during installation."
    exit 1
  fi
else
  if ! command -v npm &> /dev/null; then
    echo "Error: npm is not available in PATH. Install npm before source startup."
    exit 1
  fi
  echo "[start] using npm: $(command -v npm)"
fi

if [ "${MIMO_WEBUI_STRICT_RELEASE:-false}" != "true" ] && [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ "${MIMO_WEBUI_STRICT_RELEASE:-false}" != "true" ] && { [ ! -d "web/dist" ] || [ ! -d "server/dist" ]; }; then
  echo "Building project..."
  npm run build
fi

# Environment variables (HOST, PORT, MIMO_HOST, MIMO_PORT, MIMO_WORKSPACE_ROOT, AUTH_TOKEN) are passed through automatically.
if [ -n "${AUTH_TOKEN:-}" ]; then
  echo "[start] AUTH_TOKEN is set; authentication enabled"
fi

echo "Starting MiMo Code WebUI..."
exec "$NODE_BIN" server/dist/index.js
