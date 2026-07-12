#!/usr/bin/env bash
set -euo pipefail

unit="${1:-unknown}"
state="${2:-failed}"
webhook="${MIMO_ALERT_WEBHOOK_URL:-}"

if [ -z "$webhook" ]; then
  echo "[alert] MIMO_ALERT_WEBHOOK_URL is not configured; unit=$unit state=$state" >&2
  exit 0
fi

payload="$(node -e 'process.stdout.write(JSON.stringify({product:"mimo-code-webui",host:process.argv[1],unit:process.argv[2],state:process.argv[3],timestamp:new Date().toISOString()}))' "$(hostname)" "$unit" "$state")"
curl --fail --silent --show-error --max-time 10 \
  -H 'Content-Type: application/json' \
  --data "$payload" \
  "$webhook" >/dev/null
