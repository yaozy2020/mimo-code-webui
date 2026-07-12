#!/bin/sh
set -eu

SERVICE=${MIMO_BACKUP_SERVICE:-mimo-code-webui.service}
MARKER=${MIMO_BACKUP_MARKER:-/run/mimo-code-webui/backup-restart-required}
SYSTEMCTL=${SYSTEMCTL:-/bin/systemctl}
LOCK_FILE=${MIMO_BACKUP_LOCK_FILE:-/run/lock/mimo-code-webui-deploy.lock}
BACKUP_COMMAND=${MIMO_BACKUP_COMMAND:-/usr/bin/env node /opt/mimo-code-webui/current/scripts/backup-state.mjs}
OPERATION_ID=${MIMO_BACKUP_OPERATION_ID:-${INVOCATION_ID:-}}
STATUS_FILE=${MIMO_BACKUP_STATUS_FILE:-/var/lib/mimo-code-webui/backup-status.json}
STATUS_GROUP=${MIMO_BACKUP_STATUS_GROUP:-mimo-webui}
CURL=${CURL:-/usr/bin/curl}
HEALTH_URL=${MIMO_BACKUP_HEALTH_URL:-http://127.0.0.1:8080/status}
HEALTH_ATTEMPTS=${MIMO_BACKUP_HEALTH_ATTEMPTS:-30}
HEALTH_INTERVAL=${MIMO_BACKUP_HEALTH_INTERVAL:-1}

validate_operation_id() {
  case "$1" in
    ""|*'
'*|*[!A-Za-z0-9._:-]*)
      echo "invalid $2" >&2
      return 1
      ;;
  esac
}

read_marker() {
  marker_operation=$(node -e 'const fs=require("fs"); try { const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!v || v.version !== 1 || typeof v.operation_id !== "string" || v.healthy !== true) process.exit(1); process.stdout.write(v.operation_id) } catch { process.exit(1) }' "$MARKER") || {
    echo "invalid backup restart marker: $MARKER" >&2
    return 1
  }
  validate_operation_id "$marker_operation" "backup restart marker: $MARKER"
}

require_owner() {
  read_marker || return 1
  [ "$marker_operation" = "$OPERATION_ID" ] || {
    echo "backup restart marker belongs to another operation" >&2
    return 1
  }
}

service_state() {
  state=$($SYSTEMCTL is-active "$SERVICE" 2>/dev/null) || :
  printf '%s\n' "$state"
}

wait_for_health() {
  attempt=1
  while [ "$attempt" -le "$HEALTH_ATTEMPTS" ]; do
    if response=$($CURL --fail --silent --show-error --max-time 2 "$HEALTH_URL" 2>/dev/null) &&
      printf '%s' "$response" | node -e 'let body=""; process.stdin.on("data", chunk => body += chunk); process.stdin.on("end", () => { try { const value = JSON.parse(body); process.exit(value?.mimo?.healthy === true ? 0 : 1) } catch { process.exit(1) } })'
    then
      return 0
    fi
    attempt=$((attempt + 1))
    [ "$attempt" -gt "$HEALTH_ATTEMPTS" ] || sleep "$HEALTH_INTERVAL"
  done
  echo "WebUI did not become healthy after service restore" >&2
  return 1
}

prepare() {
  if [ "${MIMO_REUSE_EXISTING:-false}" = true ]; then
    echo "backup requires WebUI-owned MiMo processes; MIMO_REUSE_EXISTING=true" >&2
    return 1
  fi
  if [ -f "$MARKER" ]; then
    validate_operation_id "$OPERATION_ID" "backup invocation ID" || return 1
    require_owner || return 1
    echo "backup restart marker already exists for this operation" >&2
    return 1
  fi
  state=$(service_state)
  case "$state" in
    inactive) return 0 ;;
    active) ;;
    *) echo "refusing backup from ambiguous service state: ${state:-unknown}" >&2; return 1 ;;
  esac
  validate_operation_id "$OPERATION_ID" "backup invocation ID" || return 1
  wait_for_health || return 1
  marker_dir=$(dirname "$MARKER")
  install -d -m 0700 "$marker_dir"
  umask 077
  printf '{"version":1,"operation_id":"%s","healthy":true}\n' "$OPERATION_ID" > "$MARKER"
  "$SYSTEMCTL" stop "$SERVICE" || :
  state=$(service_state)
  if [ "$state" != inactive ]; then
    rm -f "$MARKER"
    echo "service did not reach explicit inactive state after stop: ${state:-unknown}" >&2
    return 1
  fi
}

restore() {
  [ -f "$MARKER" ] || return 0
  validate_operation_id "$OPERATION_ID" "backup invocation ID" || return 1
  require_owner || return 1
  "$SYSTEMCTL" start "$SERVICE" || return 1
  [ "$(service_state)" = active ] || return 1
  wait_for_health || return 1
  rm -f "$MARKER"
}

recover() {
  [ -f "$MARKER" ] || return 0
  read_marker || return 1
  "$SYSTEMCTL" start "$SERVICE" || return 1
  [ "$(service_state)" = active ] || return 1
  wait_for_health || return 1
  rm -f "$MARKER"
}

run_backup() {
  if [ "${MIMO_REUSE_EXISTING:-false}" = true ]; then
    echo "backup requires WebUI-owned MiMo processes; MIMO_REUSE_EXISTING=true" >&2
    return 1
  fi
  exec 9>"$LOCK_FILE"
  flock -n 9 || return 1
  prepare || return 1
  status=0
  if sh -c "$BACKUP_COMMAND"; then
    if [ -e "$STATUS_FILE" ]; then
      chgrp "$STATUS_GROUP" "$STATUS_FILE" || status=$?
      [ "$status" -ne 0 ] || chmod 0640 "$STATUS_FILE" || status=$?
    fi
  else
    status=$?
  fi
  restore || status=$?
  return "$status"
}

case "${1:-}" in
  prepare) prepare ;;
  restore) restore ;;
  recover) recover ;;
  run) run_backup ;;
  *) echo "usage: $0 prepare|restore|recover|run" >&2; exit 2 ;;
esac
