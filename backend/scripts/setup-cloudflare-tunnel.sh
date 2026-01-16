#!/usr/bin/env bash
# Expose the local TCGTracker backend to the internet via Cloudflare Tunnel (free).
# Use this instead of Railway when you've outgrown free hosting tiers.
#
# Prerequisites:
#   brew install cloudflared
#   Backend running on PORT (default 3001)
#
# Quick tunnel (random URL, good for testing):
#   bash scripts/setup-cloudflare-tunnel.sh
#
# Named tunnel (stable URL — requires free Cloudflare account + domain):
#   TUNNEL_NAME=tcgtracker TUNNEL_HOSTNAME=api.yourdomain.com bash scripts/setup-cloudflare-tunnel.sh --named

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3001}"
TUNNEL_NAME="${TUNNEL_NAME:-tcgtracker}"
MODE="${1:-quick}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "Install with: brew install cloudflared"
  exit 1
fi

if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "Backend is not responding on http://127.0.0.1:${PORT}/health"
  echo "Start it first: cd ${BACKEND_DIR} && npm run build && npm start"
  exit 1
fi

if [[ "$MODE" == "--named" ]]; then
  if [[ -z "${TUNNEL_HOSTNAME:-}" ]]; then
    echo "Set TUNNEL_HOSTNAME for a named tunnel, e.g.:"
    echo "  TUNNEL_HOSTNAME=api.yourdomain.com bash scripts/setup-cloudflare-tunnel.sh --named"
    exit 1
  fi

  CONFIG_DIR="${HOME}/.cloudflared"
  CONFIG_FILE="${CONFIG_DIR}/config-${TUNNEL_NAME}.yml"
  mkdir -p "$CONFIG_DIR"

  if [[ ! -f "${CONFIG_DIR}/${TUNNEL_NAME}.json" ]]; then
    echo "Creating tunnel '${TUNNEL_NAME}'..."
    cloudflared tunnel create "$TUNNEL_NAME"
  fi

  TUNNEL_ID="$(cloudflared tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" '$2 == name { print $1 }' | head -1)"
  if [[ -z "$TUNNEL_ID" ]]; then
    echo "Could not find tunnel id for ${TUNNEL_NAME}"
    exit 1
  fi

  cat > "$CONFIG_FILE" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CONFIG_DIR}/${TUNNEL_ID}.json

ingress:
  - hostname: ${TUNNEL_HOSTNAME}
    service: http://127.0.0.1:${PORT}
  - service: http_status:404
EOF

  echo "Routing DNS ${TUNNEL_HOSTNAME} -> tunnel..."
  cloudflared tunnel route dns "$TUNNEL_NAME" "$TUNNEL_HOSTNAME" 2>/dev/null || true

  echo
  echo "Stable API URL: https://${TUNNEL_HOSTNAME}"
  echo "Update Vercel / GitHub secret: VITE_API_URL=https://${TUNNEL_HOSTNAME}"
  echo
  echo "Run tunnel (keep this terminal open, or install as a service):"
  echo "  cloudflared tunnel --config ${CONFIG_FILE} run ${TUNNEL_NAME}"
  echo
  echo "Install as macOS service (starts on login):"
  echo "  cloudflared service install --config ${CONFIG_FILE}"
  exit 0
fi

echo "Starting quick Cloudflare tunnel -> http://127.0.0.1:${PORT}"
echo "Copy the https://*.trycloudflare.com URL below into Vercel VITE_API_URL for testing."
echo "(Quick tunnel URLs change each restart — use --named for a permanent URL.)"
echo
exec cloudflared tunnel --url "http://127.0.0.1:${PORT}"
