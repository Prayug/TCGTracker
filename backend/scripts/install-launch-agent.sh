#!/usr/bin/env bash
# Installs a macOS LaunchAgent so the backend starts on login and restarts if it crashes.

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
PLIST_LABEL="com.tcgtracker.backend"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_LABEL}.plist"
LOG_DIR="${BACKEND_DIR}/logs"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script is for macOS LaunchAgents."
  echo "On Linux, use systemd or pm2 instead. Example:"
  echo "  pm2 start dist/index.js --name tcgtracker --cwd ${BACKEND_DIR}"
  exit 1
fi

mkdir -p "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${BACKEND_DIR}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>dist/index.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>HOST</key>
    <string>0.0.0.0</string>
  </dict>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/${PLIST_LABEL}"
launchctl kickstart -k "gui/$(id -u)/${PLIST_LABEL}"

echo "LaunchAgent installed: ${PLIST_PATH}"
echo "Logs: ${LOG_DIR}/stdout.log and stderr.log"
echo
echo "Useful commands:"
echo "  launchctl kickstart -k gui/\$(id -u)/${PLIST_LABEL}   # restart"
echo "  launchctl bootout gui/\$(id -u)/${PLIST_LABEL}        # stop"
echo "  tail -f ${LOG_DIR}/stdout.log"
