#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

if [ "${VERIFY_RELEASE_CI_INSTALL:-false}" = "true" ]; then
  npm ci
fi

npm run verify
npm audit --omit=dev
