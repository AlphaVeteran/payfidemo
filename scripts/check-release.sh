#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/check-release.sh <intentId> [--submit]
#
# Env overrides:
#   BASE_URL, CHAIN_RPC_URL, USDC

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found"
  exit 1
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "cast not found (install Foundry first)"
  exit 1
fi

INTENT_ID="${1:-}"
DO_SUBMIT="${2:-}"
if [[ -z "$INTENT_ID" ]]; then
  echo "Usage: ./scripts/check-release.sh <intentId> [--submit]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
RPC="${CHAIN_RPC_URL:-}"
USDC="${USDC:-0x036CbD53842c5426634e7929541eC2318f3dCF7e}"
if [[ -z "$RPC" ]]; then
  echo "CHAIN_RPC_URL is empty. Please set in .env"
  exit 1
fi

echo "== Intent (before) =="
INTENT_BEFORE="$(curl -sS "$BASE_URL/api/payfi/v1/intents/$INTENT_ID")"
echo "$INTENT_BEFORE" | jq '{intentId,status,asset,user,merchant,escrowId,releaseCount,releaseNonce,releasedTotal,amountPerLesson,fundingTxHash}'

USER_ADDR="$(echo "$INTENT_BEFORE" | jq -r '.user')"
MERCHANT_ADDR="$(echo "$INTENT_BEFORE" | jq -r '.merchant')"

if [[ -z "$USER_ADDR" || "$USER_ADDR" == "null" || -z "$MERCHANT_ADDR" || "$MERCHANT_ADDR" == "null" ]]; then
  echo "Invalid intent/user/merchant"
  exit 1
fi

USER_BEFORE_RAW="$(cast call "$USDC" "balanceOf(address)(uint256)" "$USER_ADDR" --rpc-url "$RPC")"
MERCHANT_BEFORE_RAW="$(cast call "$USDC" "balanceOf(address)(uint256)" "$MERCHANT_ADDR" --rpc-url "$RPC")"
USER_BEFORE="$(echo "$USER_BEFORE_RAW" | awk '{print $1}')"
MERCHANT_BEFORE="$(echo "$MERCHANT_BEFORE_RAW" | awk '{print $1}')"

if [[ "$DO_SUBMIT" == "--submit" ]]; then
  echo "== Submit Response =="
  PREP="$(curl -sS -X POST "$BASE_URL/api/payfi/v1/intents/$INTENT_ID/release/prepare")"
  SIGS="$(echo "$PREP" | node scripts/sign-release.mjs)"
  USER_SIG="$(echo "$SIGS" | jq -r '.userSig')"
  MERCHANT_SIG="$(echo "$SIGS" | jq -r '.merchantSig')"

  SUBMIT_RESP="$(
    curl -sS -X POST "$BASE_URL/api/payfi/v1/intents/$INTENT_ID/release/submit" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg u "$USER_SIG" --arg m "$MERCHANT_SIG" '{userSig:$u,merchantSig:$m}')"
  )"
  echo "$SUBMIT_RESP" | jq .
else
  echo "== Submit Response =="
  echo "(skip) pass --submit to auto sign + submit"
fi

echo "== Intent (after) =="
INTENT_AFTER="$(curl -sS "$BASE_URL/api/payfi/v1/intents/$INTENT_ID")"
echo "$INTENT_AFTER" | jq '{intentId,status,escrowId,releaseCount,releaseNonce,releasedTotal}'

USER_AFTER_RAW="$(cast call "$USDC" "balanceOf(address)(uint256)" "$USER_ADDR" --rpc-url "$RPC")"
MERCHANT_AFTER_RAW="$(cast call "$USDC" "balanceOf(address)(uint256)" "$MERCHANT_ADDR" --rpc-url "$RPC")"
USER_AFTER="$(echo "$USER_AFTER_RAW" | awk '{print $1}')"
MERCHANT_AFTER="$(echo "$MERCHANT_AFTER_RAW" | awk '{print $1}')"

echo "== USDC Balance Diff (raw) =="
echo "user:     $USER_ADDR"
echo "before:   $USER_BEFORE_RAW"
echo "after:    $USER_AFTER_RAW"
echo "delta:    $((USER_AFTER - USER_BEFORE))"
echo
echo "merchant: $MERCHANT_ADDR"
echo "before:   $MERCHANT_BEFORE_RAW"
echo "after:    $MERCHANT_AFTER_RAW"
echo "delta:    $((MERCHANT_AFTER - MERCHANT_BEFORE))"
