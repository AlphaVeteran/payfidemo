#!/usr/bin/env bash
# Open User + Merchant pages in two separate Chrome *profiles* (macOS).
#
# 注意：每个 Profile 是独立扩展环境，新 Profile 里没有 MetaMask 是正常的。
# 若需要「两套互不干扰的钱包」（推荐联调用户/商家不同地址），请改用：
#   bash scripts/open-chrome-two-isolated.sh
#
# 1) List profile folder names:
#    ls ~/Library/Application\ Support/Google/Chrome/ | grep -E '^(Default|Profile)'
#
# 2) Run (adjust profiles to yours):
#    CHROME_PROFILE_USER="Profile 1" CHROME_PROFILE_MERCHANT="Profile 2" \
#      bash scripts/open-chrome-two-profiles.sh
#
# Or set FRONTEND_URL if Next runs on another port/host.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
USER_PROFILE="${CHROME_PROFILE_USER:-Profile 1}"
MERCHANT_PROFILE="${CHROME_PROFILE_MERCHANT:-Profile 2}"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script targets macOS Google Chrome. On Linux, use google-chrome with the same --args." >&2
  exit 1
fi

echo "[open-chrome] User profile:   $USER_PROFILE  -> $FRONTEND_URL/user"
echo "[open-chrome] Merchant profile: $MERCHANT_PROFILE -> $FRONTEND_URL/merchant"

open -na "Google Chrome" --args \
  "--profile-directory=${USER_PROFILE}" \
  "${FRONTEND_URL}/user"

sleep 1

open -na "Google Chrome" --args \
  "--profile-directory=${MERCHANT_PROFILE}" \
  "${FRONTEND_URL}/merchant"

echo "[open-chrome] Done."
