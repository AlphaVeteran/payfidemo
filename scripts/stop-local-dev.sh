#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ANVIL_PORT="${ANVIL_PORT:-8545}"
API_PORT="${PORT:-8787}"

echo "[payfidemo] Stopping local services..."

if lsof -ti :"$ANVIL_PORT" >/dev/null 2>&1; then
  kill $(lsof -ti :"$ANVIL_PORT") >/dev/null 2>&1 || true
  echo "[payfidemo] Killed listeners on port ${ANVIL_PORT}."
fi

if lsof -ti :"$API_PORT" >/dev/null 2>&1; then
  kill $(lsof -ti :"$API_PORT") >/dev/null 2>&1 || true
  echo "[payfidemo] Killed listeners on port ${API_PORT}."
fi

pkill -f "anvil --host 127.0.0.1 --port ${ANVIL_PORT}" >/dev/null 2>&1 || true
pkill -f "tsx watch src/server.ts" >/dev/null 2>&1 || true
pkill -f "tsx src/server.ts" >/dev/null 2>&1 || true
pkill -f "npm run anvil" >/dev/null 2>&1 || true
pkill -f "npm start" >/dev/null 2>&1 || true

sleep 0.5
echo "[payfidemo] Done."
