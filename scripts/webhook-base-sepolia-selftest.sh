#!/usr/bin/env bash
# Base Sepolia 链上入金后验证 webhook（INTENT_FUNDED）。
# 前置：项目根目录 .env 已配置 CHAIN_RPC_URL、ESCROW_ADDRESS、DEPLOYER_PRIVATE_KEY 或
# SUBMITTER_PRIVATE_KEY、USER_PRIVATE_KEY、MERCHANT_PRIVATE_KEY、ASSET_ADDRESS（Circle 测试 USDC）；
# 用户钱包须有足够测试 USDC（脚本会在 fund 中由 deployer 补给差额）。
#
# 用法：cd 项目根 && bash scripts/webhook-base-sepolia-selftest.sh
#
# 若第一次 fund 报 ERC20 allowance，再执行一次 fund（Circle USDC 偶发需先 approve(0) 再 approve，local-flow 已处理）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ECHO_LOG="${TMPDIR:-/tmp}/payfi-echo-base-sepolia.log"
API_LOG="${TMPDIR:-/tmp}/payfi-api-base-sepolia.log"
ECHO_PORT="${ECHO_PORT:-9997}"
API_PORT="${API_PORT:-8891}"

if ! node -e "require('dotenv').config(); const u=process.env.CHAIN_RPC_URL?.trim(),e=process.env.ESCROW_ADDRESS?.trim(),p=(process.env.SUBMITTER_PRIVATE_KEY||process.env.DEPLOYER_PRIVATE_KEY)?.trim(); if(!u||!e||!p){process.exit(1)}" 2>/dev/null; then
  echo "错误：.env 缺少链上模式所需变量（CHAIN_RPC_URL、ESCROW_ADDRESS、私钥）。"
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  for p in "$ECHO_PORT" "$API_PORT"; do
    lsof -ti ":$p" | xargs kill -9 2>/dev/null || true
  done
fi

rm -f "$ECHO_LOG" "$API_LOG"

echo "[1/6] 启动 Webhook 接收端（Node http，端口 ${ECHO_PORT}）…"
export ECHO_LOG ECHO_PORT
node -e "
const http = require('http');
const fs = require('fs');
const log = (m) => fs.appendFileSync(process.env.ECHO_LOG, m + '\\n');
const port = Number(process.env.ECHO_PORT);
http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => {
    log('=== ' + new Date().toISOString() + ' ' + req.method + ' ' + req.url + ' ===');
    log(JSON.stringify(req.headers, null, 2));
    log(b);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
}).listen(port, '127.0.0.1', () => log('[echo] ' + port));
" &
ECHO_PID=$!
sleep 0.5

echo "[2/6] 启动 API（tsx src/server.ts，Express + intents + viem 链上 funding + webhookStub）…"
PORT="$API_PORT" npx tsx src/server.ts >>"$API_LOG" 2>&1 &
API_PID=$!

for _ in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" | grep -q '"chainMode":true'; then
    break
  fi
  sleep 0.35
done

cleanup() {
  kill "$ECHO_PID" 2>/dev/null || true
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "[3/6] GET /health（应 chainMode=true）"
curl -sS "http://127.0.0.1:${API_PORT}/health"
echo ""

ACC_JSON=$(node scripts/local-flow.mjs accounts)
USER_ADDR=$(echo "$ACC_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).user")
MERCHANT_ADDR=$(echo "$ACC_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).merchant")
ASSET_ADDR=$(node -e "require('dotenv').config(); console.log(String(process.env.ASSET_ADDRESS||'').trim())")

HOOK="http://127.0.0.1:${ECHO_PORT}/payfi-hook"
# 10 USDC（6 decimals）、5 次释放；可按需改金额，须与链上 createAndDeposit 一致
AMOUNT_TOTAL="10000000"
AMOUNT_PER="2000000"
MAX_REL="5"
DUR="7200"

echo "[4/6] POST /intents（写入 webhookUrl；intentStore / Postgres 持久化由 .env 决定）"
R=$(curl -sS -X POST "http://127.0.0.1:${API_PORT}/api/payfi/v1/intents" \
  -H "Content-Type: application/json" \
  -d "{
  \"merchant\": \"${MERCHANT_ADDR}\",
  \"user\": \"${USER_ADDR}\",
  \"asset\": \"${ASSET_ADDR}\",
  \"amountTotal\": \"${AMOUNT_TOTAL}\",
  \"amountPerLesson\": \"${AMOUNT_PER}\",
  \"maxReleases\": ${MAX_REL},
  \"durationSeconds\": ${DUR},
  \"agreementHash\": \"0x0000000000000000000000000000000000000000000000000000000000000000\",
  \"termsVersion\": \"1.0.0\",
  \"webhookUrl\": \"${HOOK}\",
  \"webhookSecret\": \"base-sepolia-webhook-test\"
}")
echo "$R"
ID=$(echo "$R" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).intentId")

echo "[5/6] local-flow fund（viem → Base Sepolia createAndDeposit；再 POST funding/tx）"
set +e
BASE="http://127.0.0.1:${API_PORT}" node scripts/local-flow.mjs fund --intent "$ID"
FUND_EXIT=$?
set -e
if [[ "$FUND_EXIT" -ne 0 ]]; then
  echo "首次 fund 失败时（常见于 USDC allowance），将重试一次…"
  BASE="http://127.0.0.1:${API_PORT}" node scripts/local-flow.mjs fund --intent "$ID"
fi

sleep 0.5
echo "[6/6] 验收：接收端 POST + X-PayFi-*；API [Webhook:ok] INTENT_FUNDED"
echo "---- ${ECHO_LOG} (tail) ----"
tail -35 "$ECHO_LOG"
echo "---- grep Webhook ${API_LOG} ----"
grep Webhook "$API_LOG" | tail -6 || true
echo "完成。日志中的 txHash 可在 Basescan Sepolia 核对 EscrowCreated。"
