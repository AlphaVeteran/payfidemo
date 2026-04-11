#!/usr/bin/env bash
# 两个独立 Chrome「用户数据目录」→ 两套互不干扰的扩展与 MetaMask（各装各的）。
# macOS。与「同一 Profile 开两窗」不同，这里刻意分开。
#
# 用法：
#   1) 终端：npm run dev:frontend（及根目录 API）
#   2) bash scripts/open-chrome-two-isolated.sh
#   3) 每个窗口第一次需单独安装 MetaMask 并创建/导入不同测试钱包。
#
# 环境变量（可选）：
#   FRONTEND_URL              默认 http://127.0.0.1:3000
#   CHROME_USER_DATA_USER     默认 ~/.payfi-chrome-user
#   CHROME_USER_DATA_MERCHANT 默认 ~/.payfi-chrome-merchant

set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
USER_DIR="${CHROME_USER_DATA_USER:-$HOME/.payfi-chrome-user}"
MERCHANT_DIR="${CHROME_USER_DATA_MERCHANT:-$HOME/.payfi-chrome-merchant}"

CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ ! -x "$CHROME_APP" ]]; then
  echo "未找到 Google Chrome：$CHROME_APP" >&2
  exit 1
fi

mkdir -p "$USER_DIR" "$MERCHANT_DIR"

echo "User 数据目录:    $USER_DIR"
echo "Merchant 数据目录: $MERCHANT_DIR"
echo "（首次需在各自窗口内单独安装 MetaMask）"
echo ""

"$CHROME_APP" --user-data-dir="$USER_DIR" --new-window "${FRONTEND_URL}/user" &
sleep 1.5
"$CHROME_APP" --user-data-dir="$MERCHANT_DIR" --new-window "${FRONTEND_URL}/merchant" &

echo "已打开两个独立 Chrome 实例。"
