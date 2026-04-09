#!/usr/bin/env bash
# 本地验证：真实 POST webhook（非链上 demo funding → INTENT_FUNDED）。
# 用法：在项目根目录执行  bash scripts/webhook-local-selftest.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ECHO_LOG="${TMPDIR:-/tmp}/payfi-webhook-echo.log"
API_LOG="${TMPDIR:-/tmp}/payfi-api-selftest.log"
ECHO_PORT="${ECHO_PORT:-9998}"
API_PORT="${API_PORT:-8877}"

if command -v lsof >/dev/null 2>&1; then
  for p in "$ECHO_PORT" "$API_PORT"; do
    lsof -ti ":$p" | xargs kill -9 2>/dev/null || true
  done
fi

rm -f "$ECHO_LOG" "$API_LOG"

echo "[1/5] 启动 Webhook 接收端（Node 内置 http 模块，仅打印请求）…"
export ECHO_LOG ECHO_PORT
node -e "
const http = require('http');
const fs = require('fs');
const log = (m) => fs.appendFileSync(process.env.ECHO_LOG, m + '\\n');
const port = Number(process.env.ECHO_PORT);
const server = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    log('=== WEBHOOK ' + new Date().toISOString() + ' ===');
    log(req.method + ' ' + req.url);
    log('Headers: ' + JSON.stringify(req.headers, null, 2));
    log('Body: ' + b);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
});
server.listen(port, '127.0.0.1', () => log('[echo] listening ' + port));
" &
ECHO_PID=$!
sleep 0.4

echo "[2/5] 启动 PayFi API（tsx → src/server.ts；Express + intents + webhookStub）…"
DATABASE_URL= CHAIN_RPC_URL= ESCROW_ADDRESS= DEPLOYER_PRIVATE_KEY= SUBMITTER_PRIVATE_KEY= \
  PORT="$API_PORT" npx tsx src/server.ts >>"$API_LOG" 2>&1 &
API_PID=$!
# tsx 冷启动较慢，轮询直至 /health 可连
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

cleanup() {
  kill "$ECHO_PID" 2>/dev/null || true
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "[3/5] 健康检查 GET /health"
curl -sS "http://127.0.0.1:${API_PORT}/health"
echo ""

HOOK="http://127.0.0.1:${ECHO_PORT}/payfi-hook"
echo "[4/5] POST /intents（含 webhookUrl）+ POST .../funding/tx（demo 链下确认）"
R=$(curl -sS -X POST "http://127.0.0.1:${API_PORT}/api/payfi/v1/intents" \
  -H "Content-Type: application/json" \
  -d "{
  \"merchant\": \"0x70997970C51812dc3A010C7d01b50e0d17dc79C8\",
  \"user\": \"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\",
  \"asset\": \"0x5FbDB2315678afecb367f032d93F642f64180aa3\",
  \"amountTotal\": \"1000000000\",
  \"amountPerLesson\": \"100000000\",
  \"maxReleases\": 10,
  \"durationSeconds\": 2592000,
  \"agreementHash\": \"0x0000000000000000000000000000000000000000000000000000000000000000\",
  \"termsVersion\": \"1.0.0\",
  \"webhookUrl\": \"${HOOK}\",
  \"webhookSecret\": \"test-secret-local\"
}")
echo "create: $R"
ID=$(echo "$R" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).intentId")
curl -sS -X POST "http://127.0.0.1:${API_PORT}/api/payfi/v1/intents/${ID}/funding/tx" \
  -H "Content-Type: application/json" \
  -d '{"txHash":"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'
echo ""

sleep 0.4
echo "[5/5] 验收：接收端 POST + X-PayFi-*；API [Webhook:ok]"
echo "---- $ECHO_LOG ----"
tail -40 "$ECHO_LOG"
echo "---- grep Webhook $API_LOG ----"
grep Webhook "$API_LOG" | tail -5 || true
echo "自测结束。"
