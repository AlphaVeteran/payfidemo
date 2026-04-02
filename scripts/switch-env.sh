#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_LOCAL_FILE=".env.local.anvil"
ENV_HASHKEY_FILE=".env.hashkey.testnet"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/switch-env.sh local
  bash scripts/switch-env.sh hashkey [--refresh]

What it does:
  - Forces the repo root `.env` to become a symlink to the desired config file.
  - local:
      - If `.env.local.anvil` does not exist yet, it copies current `.env` into it.
  - hashkey:
      - If `.env.hashkey.testnet` does not exist yet, it copies `.env.example` into it.
      - With `--refresh`, it re-copies `.env.example` overwriting `.env.hashkey.testnet`.
EOF
}

mode="${1:-}"
refresh="${2:-}"

if [[ -z "$mode" || "$mode" == "-h" || "$mode" == "--help" ]]; then
  usage
  exit 0
fi

force_link() {
  local target="$1"
  if [[ ! -e "$target" ]]; then
    echo "[switch-env] ERROR: missing target file: $target" >&2
    exit 1
  fi

  # Replace `.env` with symlink to target.
  rm -f .env
  ln -s "$target" .env
}

case "$mode" in
  local)
    if [[ ! -e "$ENV_LOCAL_FILE" ]]; then
      if [[ -e ".env" ]]; then
        echo "[switch-env] Creating $ENV_LOCAL_FILE by copying current .env"
        cp ".env" "$ENV_LOCAL_FILE"
      else
        echo "[switch-env] ERROR: .env does not exist and $ENV_LOCAL_FILE is missing" >&2
        exit 1
      fi
    fi
    echo "[switch-env] Switching to local anvil env ($ENV_LOCAL_FILE)"
    force_link "$ENV_LOCAL_FILE"
    ;;
  hashkey)
    # If local backup doesn't exist yet, preserve the current `.env` before we replace it.
    if [[ ! -e "$ENV_LOCAL_FILE" ]]; then
      if [[ -e ".env" ]]; then
        echo "[switch-env] Preserving current .env into $ENV_LOCAL_FILE"
        # Follow symlink if `.env` is already a symlink.
        cp -L ".env" "$ENV_LOCAL_FILE"
      else
        echo "[switch-env] WARNING: .env does not exist; cannot create $ENV_LOCAL_FILE backup" >&2
      fi
    fi

    if [[ "$refresh" == "--refresh" ]]; then
      echo "[switch-env] Refreshing $ENV_HASHKEY_FILE from .env.example"
      cp ".env.example" "$ENV_HASHKEY_FILE"
    else
      if [[ ! -e "$ENV_HASHKEY_FILE" ]]; then
        echo "[switch-env] Creating $ENV_HASHKEY_FILE from .env.example"
        cp ".env.example" "$ENV_HASHKEY_FILE"
      fi
    fi
    echo "[switch-env] Switching to hashkey testnet env ($ENV_HASHKEY_FILE)"
    force_link "$ENV_HASHKEY_FILE"
    ;;
  *)
    echo "[switch-env] ERROR: unknown mode: $mode" >&2
    usage >&2
    exit 1
    ;;
esac

echo "[switch-env] Done. Current .env -> $(readlink .env 2>/dev/null || echo '<not a symlink>')"

