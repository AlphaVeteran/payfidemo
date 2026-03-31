#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$HOME/.foundry/bin:$PATH"

ANVIL_PORT="${ANVIL_PORT:-8545}"
API_PORT="${PORT:-8787}"
ANVIL_IPC="${ANVIL_IPC:-/tmp/payfi-anvil.ipc}"
ANVIL_KEY="${ANVIL_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
ANVIL_CHAIN_ID="${ANVIL_CHAIN_ID:-31338}"
export ANVIL_CHAIN_ID
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

echo "[payfidemo] Verifying Anvil RPC..."
CHAIN_HEX_EXPECTED="$(printf '0x%x' "$ANVIL_CHAIN_ID")"
RPC_OK="false"
for i in {1..20}; do
  CHAIN_HEX="$(curl -sS -X POST "http://127.0.0.1:${ANVIL_PORT}" \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    | node -e 'const fs=require("fs");const t=fs.readFileSync(0,"utf8");try{const j=JSON.parse(t);process.stdout.write(String(j.result||""));}catch{process.stdout.write("");}')"
  BLOCK_HEX="$(curl -sS -X POST "http://127.0.0.1:${ANVIL_PORT}" \
    -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    | node -e 'const fs=require("fs");const t=fs.readFileSync(0,"utf8");try{const j=JSON.parse(t);process.stdout.write(String(j.result||""));}catch{process.stdout.write("");}')"
  if [[ -n "$CHAIN_HEX" && -n "$BLOCK_HEX" && "$CHAIN_HEX" == "$CHAIN_HEX_EXPECTED" ]]; then
    RPC_OK="true"
    break
  fi
  sleep 0.5
done

if [[ "$RPC_OK" != "true" ]]; then
  echo "[payfidemo] ERROR: Anvil RPC self-check failed."
  echo "  expected chainId: ${ANVIL_CHAIN_ID} (${CHAIN_HEX_EXPECTED})"
  echo "  got chainId: ${CHAIN_HEX:-<empty>}, blockNumber: ${BLOCK_HEX:-<empty>}"
  echo "  Check .anvil.log for details."
  exit 1
fi

echo "[payfidemo] Bootstrapping contracts..."
npm run anvil:bootstrap > .bootstrap.log 2>&1

ADDRS="$(node -e '
const fs = require("fs");
const p =
  "broadcast/LocalAnvilBootstrap.s.sol/" +
  process.env.ANVIL_CHAIN_ID +
  "/run-latest.json";
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
  CHAIN_ID: String(process.env.ANVIL_CHAIN_ID),
  CHAIN_RPC_URL: "http://127.0.0.1:8545",
  ESCROW_ADDRESS: escrow,
  DEPLOYER_PRIVATE_KEY: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  SUBMITTER_PRIVATE_KEY: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
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

echo "[payfidemo] Ready."
echo "  Escrow: $ESCROW_ADDR"
echo "  MockERC20: $TOKEN_ADDR"
echo "  API base: http://127.0.0.1:${API_PORT}"
echo "  Web URL: $APP_URL"
echo "  API health:"
curl -sS "http://127.0.0.1:${API_PORT}/health" | node -e '
const fs = require("fs");
const raw = fs.readFileSync(0, "utf8");
try {
  const j = JSON.parse(raw);
  console.log(`    ok=${Boolean(j.ok)} service=${j.service ?? "-"} chainId=${j.chainId ?? "-"} walletChainId=${j.walletChainId ?? "-"} chainMode=${j.chainMode ?? "-"}`);
} catch {
  console.log(`    raw=${raw.trim()}`);
}
'
echo "  Logs: .anvil.log .bootstrap.log .api.log"
