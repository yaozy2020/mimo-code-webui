#!/usr/bin/env bash
set -euo pipefail

# Keep a mimo serve instance alive on the base port (default 4096).
# This is a manual fallback for deployments where the WebUI server cannot be
# restarted yet. The WebUI backend's built-in health monitor is the preferred
# path for normal production runs.

export HOME="${HOME:-/home/yzy}"
export MIMO_CONFIG_PATH="${MIMO_CONFIG_PATH:-/home/yzy/.config/mimocode/config.json}"

HOST="${MIMO_HOST:-127.0.0.1}"
PORT="${MIMO_PORT:-4096}"
INTERVAL="${WATCHDOG_INTERVAL_SEC:-5}"
LOG_FILE="${WATCHDOG_LOG:-/tmp/mimo-watchdog.log}"
PID_FILE="${WATCHDOG_PID_FILE:-/tmp/mimo-watchdog-${PORT}.pid}"

health_url="http://${HOST}:${PORT}/global/health"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

is_healthy() {
  curl -s --max-time 3 -o /dev/null -w "%{http_code}" "$health_url" 2>/dev/null | grep -q '^200$'
}

read_managed_pid() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 1
  fi

  local pid
  pid="$(<"$PID_FILE")"
  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    rm -f "$PID_FILE"
    return 1
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
    return 1
  fi

  printf '%s\n' "$pid"
}

stop_managed_mimo() {
  local pid
  if ! pid="$(read_managed_pid)"; then
    return 0
  fi

  log "stopping managed mimo serve pid ${pid}"
  kill "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      return 0
    fi
    sleep 1
  done

  log "managed mimo serve pid ${pid} did not stop; leaving it for manual inspection"
}

start_mimo() {
  log "starting mimo serve on ${HOST}:${PORT}"
  nohup mimo serve "--hostname=${HOST}" "--port=${PORT}" >> "$LOG_FILE" 2>&1 &
  local pid=$!
  printf '%s\n' "$pid" > "$PID_FILE"
  log "managed mimo serve pid ${pid}"
}

cleanup() {
  log "watchdog exiting"
}

trap cleanup EXIT
trap 'trap - EXIT; cleanup; exit 0' INT TERM

log "watchdog started for ${HOST}:${PORT}; pid file ${PID_FILE}"

while true; do
  if ! is_healthy; then
    log "mimo serve ${HOST}:${PORT} is unhealthy, restarting"
    stop_managed_mimo
    start_mimo
    # Give mimo a few seconds to come up before the next check.
    sleep 5
  fi
  sleep "$INTERVAL"
done
