#!/usr/bin/env bash
# Creates a portable archive of the TCGTracker backend for moving to another machine.
# Run from anywhere; defaults to the backend directory that contains this script.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$HOME/Desktop}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_NAME="tcgtracker-backend-migration-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_NAME}"
STAGING="$(mktemp -d)"
STAGE_BACKEND="${STAGING}/backend"

cleanup() {
  rm -rf "$STAGING"
}
trap cleanup EXIT

echo "=== TCGTracker backend migration export ==="
echo "Source: ${BACKEND_DIR}"
echo "Output: ${ARCHIVE_PATH}"
echo

if pgrep -f "node dist/index.js" >/dev/null 2>&1 || pgrep -f "ts-node src/index.ts" >/dev/null 2>&1; then
  echo "WARNING: A TCGTracker backend process appears to be running."
  echo "Stop it first so SQLite can be copied safely:"
  echo "  pkill -f 'node dist/index.js'   # or Ctrl+C in the terminal running npm run dev"
  echo
  read -r -p "Continue anyway? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

DB_PATH="${BACKEND_DIR}/tcg-prices.db"
if [[ -f "$DB_PATH" ]]; then
  echo "Checkpointing SQLite WAL (merges .db-wal into main database)..."
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"
  else
    echo "sqlite3 not found — copy may be inconsistent if the server was recently writing."
  fi
else
  echo "WARNING: ${DB_PATH} not found. Export will continue without the price database."
fi

mkdir -p "$STAGE_BACKEND"

echo "Copying backend files..."
COPY_ITEMS=(
  .env
  .env.example
  package.json
  package-lock.json
  dist
  src
  tsconfig.json
  tcg-prices.db
)

for item in "${COPY_ITEMS[@]}"; do
  if [[ -e "${BACKEND_DIR}/${item}" ]]; then
    cp -R "${BACKEND_DIR}/${item}" "${STAGE_BACKEND}/"
  fi
done

read -r -p "Include node_modules (~300MB)? Saves npm install on the new machine. [y/N] " include_modules
if [[ "$include_modules" =~ ^[Yy]$ ]]; then
  echo "Copying node_modules (this may take a minute)..."
  cp -R "${BACKEND_DIR}/node_modules" "${STAGE_BACKEND}/"
fi

cat > "${STAGING}/MIGRATION_README.txt" <<'EOF'
TCGTracker Backend Migration Package
====================================

On the new machine:
1. Install Node.js 20+ (https://nodejs.org)
2. Extract this archive
3. cd backend && bash scripts/migrate-setup.sh
4. bash scripts/install-launch-agent.sh   (optional — auto-start on login/reboot)

Verify: curl http://localhost:3001/health

Scheduled jobs (America/New_York):
  1:30 AM — catalog sync
  1:45 AM — One Piece sync
  2:00 AM — daily price update
  3:00 AM — predictions

Keep this machine online with internet. Your main PC can be offline.
EOF

mkdir -p "$OUTPUT_DIR"
tar -czf "$ARCHIVE_PATH" -C "$STAGING" .

SIZE="$(du -h "$ARCHIVE_PATH" | cut -f1)"
echo
echo "Done. Archive: ${ARCHIVE_PATH} (${SIZE})"
echo "Transfer via USB drive, AirDrop, or local network (scp/rsync)."
