#!/usr/bin/env bash
# Keep a Cloudflare quick-tunnel to the local backend alive without a terminal,
# and retarget Vercel when the tunnel URL changes.
#
# Usage:
#   bash scripts/api-tunnel.sh start      # background tunnel (survives closing the terminal)
#   bash scripts/api-tunnel.sh stop
#   bash scripts/api-tunnel.sh status
#   bash scripts/api-tunnel.sh fix        # start + retarget Vercel if needed + verify
#   bash scripts/api-tunnel.sh install    # LaunchAgent: start tunnel on login / restart on crash
#   bash scripts/api-tunnel.sh uninstall
#
# Requires: cloudflared, local backend on :3001, vercel CLI logged in (for fix/retarget).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3001}"
STATE_DIR="${HOME}/.tcgtracker"
PID_FILE="${STATE_DIR}/api-tunnel.pid"
LOG_FILE="${STATE_DIR}/api-tunnel.log"
URL_FILE="${STATE_DIR}/api-tunnel.url"
VERCEL_URL_FILE="${STATE_DIR}/api-tunnel.vercel-url"
PLIST_LABEL="com.tcgtracker.api-tunnel"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_LABEL}.plist"
CLOUDFLARED_BIN="$(command -v cloudflared || true)"

mkdir -p "$STATE_DIR"

die() { echo "error: $*" >&2; exit 1; }

require_cloudflared() {
  [[ -n "$CLOUDFLARED_BIN" ]] || die "cloudflared not found. Install with: brew install cloudflared"
}

backend_ok() {
  curl -sf --max-time 3 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 \
    || curl -sf --max-time 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1
}

launchagent_loaded() {
  [[ -f "$PLIST_PATH" ]] && launchctl print "gui/$(id -u)/${PLIST_LABEL}" >/dev/null 2>&1
}

tunnel_pids() {
  pgrep -f "cloudflared tunnel --url http://127.0.0.1:${PORT}" 2>/dev/null || true
}

read_url_from_log() {
  grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | tail -1 || true
}

read_url() {
  local url
  url="$(read_url_from_log)"
  if [[ -z "$url" && -f "$URL_FILE" ]]; then
    url="$(cat "$URL_FILE")"
  fi
  echo "${url:-}"
}

vercel_destination() {
  python3 - <<'PY'
import json, pathlib
p = pathlib.Path("vercel.json")
if not p.exists():
  raise SystemExit(0)
data = json.loads(p.read_text())
for r in data.get("rewrites") or []:
  if r.get("source") == "/api/:path*":
    dest = r.get("destination") or ""
    print(dest.rsplit("/api/:path*", 1)[0])
    break
PY
}

wait_for_url() {
  local i url
  for i in $(seq 1 60); do
    if grep -q "Registered tunnel connection" "$LOG_FILE" 2>/dev/null; then
      url="$(read_url_from_log)"
      if [[ -n "$url" ]]; then
        echo "$url" | tee "$URL_FILE"
        return 0
      fi
    fi
    sleep 1
  done
  return 1
}

probe_tunnel() {
  local url="$1" host ip code
  host="${url#https://}"
  for _ in $(seq 1 25); do
    ip="$(dig +short "$host" A @1.1.1.1 2>/dev/null | head -1 || true)"
    if [[ -z "$ip" ]]; then
      sleep 2
      continue
    fi
    code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 \
      --resolve "${host}:443:${ip}" "${url}/api/health" 2>/dev/null || echo 000)"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

kill_tunnels() {
  local pids
  pids="$(tunnel_pids)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}

cmd_stop() {
  if launchagent_loaded; then
    launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
    echo "Stopped LaunchAgent ${PLIST_LABEL}."
  fi
  kill_tunnels
  echo "Tunnel stopped."
}

start_nohup() {
  : > "$LOG_FILE"
  nohup "$CLOUDFLARED_BIN" tunnel --url "http://127.0.0.1:${PORT}" --protocol http2 \
    >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  disown $! 2>/dev/null || true
  echo "Started cloudflared (pid $(cat "$PID_FILE"))."
}

cmd_start() {
  require_cloudflared
  if ! backend_ok; then
    die "Backend not responding on :${PORT}. Start it first (or: bash backend/scripts/install-launch-agent.sh)."
  fi

  # Prefer LaunchAgent if installed — it keeps cloudflared in the foreground.
  if [[ -f "$PLIST_PATH" ]]; then
    if ! launchagent_loaded; then
      launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || true
      launchctl enable "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
    fi
    # Truncate log so we pick up the new URL after restart
    : > "$LOG_FILE"
    launchctl kickstart -k "gui/$(id -u)/${PLIST_LABEL}"
    echo "Started via LaunchAgent ${PLIST_LABEL}."
  else
    local existing
    existing="$(tunnel_pids | head -1 || true)"
    if [[ -n "${existing:-}" ]]; then
      local url
      url="$(read_url)"
      if [[ -n "$url" ]] && probe_tunnel "$url"; then
        echo "Already running (pid $existing): $url"
        return 0
      fi
      echo "Existing tunnel unhealthy — restarting..."
      kill_tunnels
    fi
    start_nohup
  fi

  echo "Waiting for tunnel URL..."
  local url
  if ! url="$(wait_for_url)"; then
    die "Timed out waiting for trycloudflare URL. See $LOG_FILE"
  fi
  echo "Tunnel URL: $url"
  if ! probe_tunnel "$url"; then
    die "Tunnel registered but /api/health did not return 200. See $LOG_FILE"
  fi
  echo "Tunnel healthy."
}

cmd_status() {
  local pids url dest prod
  pids="$(tunnel_pids | tr '\n' ' ')"
  url="$(read_url)"
  dest="$(cd "$ROOT" && vercel_destination || true)"
  echo "backend  :$(backend_ok && echo " up (:${PORT})" || echo " DOWN (:${PORT})")"
  echo "tunnel   :$( [[ -n "${pids// /}" ]] && echo " running (pids ${pids})" || echo " stopped")"
  echo "launchd  :$(launchagent_loaded && echo " loaded" || echo " not loaded")"
  echo "url      : ${url:-"(none)"}"
  echo "vercel.json -> ${dest:-"(none)"}"
  if [[ -n "${url:-}" && -n "${dest:-}" && "$url" == "$dest" ]]; then
    echo "rewrite  : in sync"
  elif [[ -n "${url:-}" || -n "${dest:-}" ]]; then
    echo "rewrite  : OUT OF SYNC (run: bash scripts/api-tunnel.sh fix)"
  fi
  prod="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 \
    "https://tcgtracker-pearl.vercel.app/api/health" 2>/dev/null || echo 000)"
  echo "prod /api/health: $prod"
}

cmd_fix() {
  cd "$ROOT"
  cmd_start
  local url dest last_deployed=""
  url="$(read_url)"
  dest="$(vercel_destination || true)"
  [[ -f "$VERCEL_URL_FILE" ]] && last_deployed="$(cat "$VERCEL_URL_FILE")"

  if [[ "$url" == "$dest" && "$url" == "$last_deployed" ]]; then
    local prod
    prod="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 \
      "https://tcgtracker-pearl.vercel.app/api/health" 2>/dev/null || echo 000)"
    if [[ "$prod" == "200" ]]; then
      echo "Vercel already points at $url and prod is healthy. Nothing to deploy."
      return 0
    fi
    echo "Rewrite looks correct but prod returned $prod — redeploying..."
  else
    echo "Retargeting Vercel -> $url"
  fi

  bash "$ROOT/scripts/retarget-vercel-tunnel.sh" "$url"
  echo "$url" > "$VERCEL_URL_FILE"

  local prod
  prod="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 \
    "https://tcgtracker-pearl.vercel.app/api/health" 2>/dev/null || echo 000)"
  if [[ "$prod" != "200" ]]; then
    die "Deploy finished but prod /api/health returned $prod"
  fi
  echo "Prod healthy (200)."
}

cmd_install() {
  require_cloudflared
  [[ "$(uname -s)" == "Darwin" ]] || die "LaunchAgent install is macOS-only."

  # Run cloudflared in the foreground so KeepAlive works correctly.
  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${CLOUDFLARED_BIN}</string>
    <string>tunnel</string>
    <string>--url</string>
    <string>http://127.0.0.1:${PORT}</string>
    <string>--protocol</string>
    <string>http2</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
EOF

  kill_tunnels
  launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
  : > "$LOG_FILE"
  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
  launchctl enable "gui/$(id -u)/${PLIST_LABEL}"
  launchctl kickstart -k "gui/$(id -u)/${PLIST_LABEL}"

  echo "Installed LaunchAgent: $PLIST_PATH"
  echo "Tunnel starts on login and restarts if it crashes (no terminal needed)."
  echo
  echo "IMPORTANT: quick-tunnel URLs change every restart."
  echo "After reboot or if the site 502s, run once:"
  echo "  bash scripts/api-tunnel.sh fix"
  echo
  echo "Logs: $LOG_FILE"
}

cmd_uninstall() {
  launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  kill_tunnels
  echo "Uninstalled LaunchAgent ${PLIST_LABEL}."
}

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \?//'
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    start) cmd_start ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    fix) cmd_fix ;;
    install) cmd_install ;;
    uninstall) cmd_uninstall ;;
    ""|-h|--help|help) usage ;;
    *) die "unknown command: $cmd (try: start|stop|status|fix|install|uninstall)" ;;
  esac
}

main "$@"
