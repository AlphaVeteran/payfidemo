#!/usr/bin/env bash
set -euo pipefail

APP_URL="${1:-http://localhost:3000/}"
CHROME_APP="${CHROME_APP:-Google Chrome}"
ROOT_DIR="${HOME}/Library/Application Support/PayFiDemo/ChromeProfiles"
RABBY_STORE_URL="${RABBY_STORE_URL:-https://chromewebstore.google.com/detail/rabby-wallet/acmacodkjbdgmoleebolmdjonilkdbch}"
ENV_FILE="${ENV_FILE:-.env}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

mkdir -p "${ROOT_DIR}/deployer" "${ROOT_DIR}/user" "${ROOT_DIR}/merchant"

derive_address() {
  local pk="$1"
  if [[ -z "${pk}" ]]; then
    echo "-"
    return
  fi
  node -e '
const { privateKeyToAccount } = require("viem/accounts");
const pk = process.argv[1];
const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
process.stdout.write(privateKeyToAccount(hex).address);
' "${pk}"
}

open_profile() {
  local role="$1"
  local dir="${ROOT_DIR}/${role}"
  local role_url="${APP_URL}"
  if [[ "${APP_URL}" == *\?* ]]; then
    role_url="${APP_URL}&role=${role}"
  else
    role_url="${APP_URL}?role=${role}"
  fi
  open -na "${CHROME_APP}" --args \
    --user-data-dir="${dir}" \
    --new-window "${role_url}"
}

open_profile "deployer"
sleep 0.3
open_profile "user"
sleep 0.3
open_profile "merchant"

# First-time setup helper: open Rabby extension page in each isolated profile.
open -na "${CHROME_APP}" --args --user-data-dir="${ROOT_DIR}/deployer" --new-tab "${RABBY_STORE_URL}"
open -na "${CHROME_APP}" --args --user-data-dir="${ROOT_DIR}/user" --new-tab "${RABBY_STORE_URL}"
open -na "${CHROME_APP}" --args --user-data-dir="${ROOT_DIR}/merchant" --new-tab "${RABBY_STORE_URL}"

USER_ADDR="$(derive_address "${USER_PRIVATE_KEY:-}")"
MERCHANT_ADDR="$(derive_address "${MERCHANT_PRIVATE_KEY:-}")"
DEPLOYER_PK="${DEPLOYER_PRIVATE_KEY:-${SUBMITTER_PRIVATE_KEY:-}}"
DEPLOYER_ADDR="$(derive_address "${DEPLOYER_PK}")"

echo "[payfidemo] Opened 3 isolated Chrome profiles:"
echo "  - deployer: ${ROOT_DIR}/deployer"
echo "  - user:     ${ROOT_DIR}/user"
echo "  - merchant: ${ROOT_DIR}/merchant"
echo "[payfidemo] URL base: ${APP_URL}"
echo "[payfidemo] Role -> EOA mapping"
echo "  - deployer: ${DEPLOYER_ADDR}"
echo "  - user:     ${USER_ADDR}"
echo "  - merchant: ${MERCHANT_ADDR}"
echo "[payfidemo] Rabby install page opened for each profile."
