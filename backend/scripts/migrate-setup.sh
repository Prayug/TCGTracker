#!/usr/bin/env bash
# First-time setup after extracting a migration archive on the spare machine.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BACKEND_DIR"

echo "=== TCGTracker backend setup ==="
echo "Directory: ${BACKEND_DIR}"
echo

if [[ ! -f .env ]]; then
  echo "ERROR: backend/.env is missing. Copy it from your old machine before continuing."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node 20+ from https://nodejs.org"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "ERROR: Node ${NODE_MAJOR} is too old. Install Node 18 or 20+."
  exit 1
fi

echo "Node: $(node -v)"
echo

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm ci
else
  echo "node_modules present — skipping npm ci"
fi

if [[ ! -d dist ]] || [[ ! -f dist/index.js ]]; then
  echo "Building TypeScript..."
  npm run build
fi

if [[ ! -f tcg-prices.db ]]; then
  echo "WARNING: tcg-prices.db not found. A fresh database will be created on first start."
fi

# Recommend production settings for an always-on price server
if grep -q '^HOST=localhost' .env 2>/dev/null; then
  echo
  echo "Tip: Consider changing HOST=localhost to HOST=0.0.0.0 in .env"
  echo "     (only needed if other devices must reach this API over the network)"
fi

if grep -q '^NODE_ENV=development' .env 2>/dev/null; then
  echo "Tip: Consider NODE_ENV=production on the spare always-on machine."
fi

echo
echo "Starting server for a quick health check (Ctrl+C to stop after verifying)..."
echo "  npm start"
echo
read -r -p "Run health check now? [Y/n] " run_check
if [[ ! "$run_check" =~ ^[Nn]$ ]]; then
  npm start &
  SERVER_PID=$!
  trap "kill $SERVER_PID 2>/dev/null || true" EXIT

  for i in {1..30}; do
    if curl -sf "http://localhost:3001/health" >/dev/null 2>&1; then
      echo "Health check passed."
      curl -s "http://localhost:3001/api/status" | head -c 500
      echo
      kill "$SERVER_PID" 2>/dev/null || true
      wait "$SERVER_PID" 2>/dev/null || true
      trap - EXIT
      break
    fi
    sleep 1
    if [[ "$i" -eq 30 ]]; then
      echo "ERROR: Server did not respond on :3001 within 30s. Check backend.log"
      kill "$SERVER_PID" 2>/dev/null || true
      exit 1
    fi
  done
fi

echo
echo "Setup complete. To run manually:"
echo "  cd ${BACKEND_DIR} && npm start"
echo
echo "To auto-start on login/reboot (macOS):"
echo "  bash scripts/install-launch-agent.sh"
