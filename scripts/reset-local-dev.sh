#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$HOME/.foundry/bin:$PATH"

ANVIL_PORT="${ANVIL_PORT:-8545}"
API_PORT="${PORT:-8787}"
ANVIL_IPC="${ANVIL_IPC:-/tmp/payfi-anvil.ipc}"
ANVIL_KEY="${ANVIL_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
APP_URL="http://127.0.0.1:${API_PORT}/"

echo "[payfidemo] Stopping old local processes..."
if lsof -ti :"$ANVIL_PORT" >/dev/null 2>&1; then
  kill $(lsof -ti :"$ANVIL_PORT") >/dev/null 2>&1 || true
fi
if lsof -ti :"$API_PORT" >/dev/null 2>&1; then
  kill $(lsof -ti :"$API_PORT") >/dev/null 2>&1 || true
fi
pkill -f "anvil --host 127.0.0.1 --port ${ANVIL_PORT}" >/dev/null 2>&1 || true
pkill -f "tsx watch src/server.ts" >/dev/null 2>&1 || true
pkill -f "tsx src/server.ts" >/dev/null 2>&1 || true
sleep 1

echo "[payfidemo] Starting Anvil..."
nohup npm run anvil > .anvil.log 2>&1 &
ANVIL_PID=$!
echo "[payfidemo] Anvil PID: ${ANVIL_PID} (log: .anvil.log)"

for i in {1..20}; do
  if lsof -ti :"$ANVIL_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! lsof -ti :"$ANVIL_PORT" >/dev/null 2>&1; then
  echo "[payfidemo] ERROR: Anvil failed to start. Check .anvil.log"
  exit 1
fi

echo "[payfidemo] Bootstrapping contracts..."
npm run anvil:bootstrap > .bootstrap.log 2>&1

ADDRS="$(node -e '
const fs = require("fs");
const p = "broadcast/LocalAnvilBootstrap.s.sol/31337/run-latest.json";
const j = JSON.parse(fs.readFileSync(p, "utf8"));
const txs = j.transactions || [];
const escrow = txs.find(t => t.contractName === "PayFiEscrow")?.contractAddress || "";
const token = txs.find(t => t.contractName === "MockERC20")?.contractAddress || "";
if (!escrow || !token) process.exit(2);
process.stdout.write(`${escrow} ${token}`);
')"
ESCROW_ADDR="$(echo "$ADDRS" | awk '{print $1}')"
TOKEN_ADDR="$(echo "$ADDRS" | awk '{print $2}')"

echo "[payfidemo] Updating .env..."
touch .env
node -e '
const fs = require("fs");
const path = ".env";
const escrow = process.argv[1];
const token = process.argv[2];
const required = {
  PORT: "8787",
  CHAIN_ID: "31337",
  CHAIN_RPC_URL: "http://127.0.0.1:8545",
  ESCROW_ADDRESS: escrow,
  SUBMITTER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  USER_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  MERCHANT_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  X402_ENABLED: "false",
  PAYFIDEMO_DEBUG: "true",
};
let text = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
for (const [k, v] of Object.entries(required)) {
  const re = new RegExp(`^${k}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, `${k}=${v}`);
  else text += (text.endsWith("\n") || text.length === 0 ? "" : "\n") + `${k}=${v}\n`;
}
if (!/^ASSET_ADDRESS=/m.test(text)) text += `ASSET_ADDRESS=${token}\n`;
else text = text.replace(/^ASSET_ADDRESS=.*$/m, `ASSET_ADDRESS=${token}`);
fs.writeFileSync(path, text);
' "$ESCROW_ADDR" "$TOKEN_ADDR"

echo "[payfidemo] Starting API..."
nohup npm start > .api.log 2>&1 &
API_PID=$!
echo "[payfidemo] API PID: ${API_PID} (log: .api.log)"

for i in {1..20}; do
  if curl -sS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -sS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
  echo "[payfidemo] ERROR: API failed to start. Check .api.log"
  exit 1
fi

echo "[payfidemo] Opening dedicated Chrome window..."
open -na "Google Chrome" --args --new-window "$APP_URL"

echo "[payfidemo] Ready."
echo "  Escrow: $ESCROW_ADDR"
echo "  MockERC20: $TOKEN_ADDR"
echo "  URL: $APP_URL"
echo "  Logs: .anvil.log .bootstrap.log .api.log"
