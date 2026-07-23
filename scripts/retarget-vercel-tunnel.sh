#!/usr/bin/env bash
# Retarget Vercel production at a new Cloudflare quick-tunnel URL.
#
# Usage:
#   1. Ensure backend is on :3001 and a tunnel is running (or pass URL):
#        bash backend/scripts/setup-cloudflare-tunnel.sh   # leave running
#   2. Point Vercel at it:
#        bash scripts/retarget-vercel-tunnel.sh https://xxxx.trycloudflare.com
#
# Frontend stays on same-origin /api/* (no VITE_API_URL rebuild needed after the
# first same-origin deploy). Only vercel.json rewrite destination changes.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TUNNEL="${1:-}"
if [[ -z "$TUNNEL" ]]; then
  echo "Usage: $0 https://xxxx.trycloudflare.com"
  exit 1
fi
TUNNEL="${TUNNEL%/}"

if [[ "$TUNNEL" == *"NEW-URL"* ]] || [[ "$TUNNEL" == *"xxxx"* ]]; then
  echo "That looks like a placeholder, not a real tunnel URL."
  echo "Start a tunnel first, then pass the https://….trycloudflare.com URL it prints."
  exit 1
fi
if [[ ! "$TUNNEL" =~ ^https://[a-z0-9.-]+\.trycloudflare\.com$ ]] && [[ ! "$TUNNEL" =~ ^https:// ]]; then
  echo "Refusing non-https tunnel URL: $TUNNEL"
  exit 1
fi

python3 - "$TUNNEL" <<'PY'
import json, pathlib, sys
tunnel = sys.argv[1].rstrip("/")
path = pathlib.Path("vercel.json")
data = json.loads(path.read_text())
rewrites = data.get("rewrites") or []
api = {"source": "/api/:path*", "destination": f"{tunnel}/api/:path*"}
others = [r for r in rewrites if r.get("source") != "/api/:path*"]
data["rewrites"] = [api, *others]
path.write_text(json.dumps(data, indent=2) + "\n")
print(f"Updated vercel.json /api rewrite -> {tunnel}")
PY

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1 || true

# Keep frontend on same-origin in production.
for VAR in VITE_API_URL VITE_BACKEND_URL VITE_API_BASE_URL; do
  npx vercel env rm "$VAR" production --yes >/dev/null 2>&1 || true
  printf '%s' 'http://localhost:3001' | npx vercel env add "$VAR" production --yes >/dev/null
  echo "Set $VAR=http://localhost:3001 (same-origin in prod)"
done

echo "Building + deploying..."
export VITE_API_URL=http://localhost:3001
export VITE_BACKEND_URL=http://localhost:3001
export VITE_API_BASE_URL=http://localhost:3001
npx vercel pull --yes --environment=production >/dev/null
npx vercel build --prod --yes
npx vercel deploy --prebuilt --prod --yes --archive=tgz

echo
echo "Done. Production should call /api/* on the Vercel host, proxied to:"
echo "  $TUNNEL"
echo "Keep cloudflared + local backend running."
