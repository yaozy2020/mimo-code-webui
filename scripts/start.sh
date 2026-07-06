#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed. Please install Node.js 18+ first."
  exit 1
fi

if [ ! -d "node_modules" ] || [ ! -d "web/node_modules" ] || [ ! -d "server/node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

if [ ! -d "web/dist" ] || [ ! -d "server/dist" ]; then
  echo "Building project..."
  npm run build
fi

# Environment variables (HOST, PORT, MIMO_HOST, MIMO_PORT, MIMO_WORKSPACE_ROOT, AUTH_TOKEN) are passed through automatically.
if [ -n "${AUTH_TOKEN:-}" ]; then
  echo "[start] AUTH_TOKEN is set; authentication enabled"
fi

echo "Starting MiMo Code WebUI..."
exec npm start
