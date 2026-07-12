#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

if [ "${VERIFY_RELEASE_CI_INSTALL:-false}" = "true" ]; then
  npm ci
fi

npm run verify
node scripts/deployment.test.mjs
npm audit --omit=dev

if [ -n "${VERIFY_RELEASE_SIGNING_KEY:-}" ]; then
  RELEASE_SIGNING_KEY="$VERIFY_RELEASE_SIGNING_KEY" npm run package:release
  archive="dist-release/mimo-code-webui-v$(node -p 'require("./package.json").version').tar.gz"
  public_key="$(mktemp)"
  trap 'rm -f "$public_key"' EXIT
  openssl pkey -in "$VERIFY_RELEASE_SIGNING_KEY" -pubout -out "$public_key"
  openssl pkeyutl -verify -pubin -inkey "$public_key" -rawin -in "$archive" -sigfile "$archive.sig"
fi
