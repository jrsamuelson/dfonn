#!/bin/zsh

set -euo pipefail

cd "$(dirname "$0")"

PORT=8000

while lsof -PiTCP:$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

python3 -m http.server "$PORT" >/tmp/onn-local-server.log 2>&1 &
SERVER_PID=$!

sleep 1

URL="http://127.0.0.1:${PORT}/index.html"
open "$URL"

echo
echo "ONN local server is running."
echo "Open this URL if your browser did not launch automatically:"
echo "$URL"
echo
echo "Keep this window open while you use ONN."
echo "Press Enter here when you want to stop the local server."
read -r _
