#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_LOCAL_FILE=".env.local.anvil"
ENV_HASHKEY_FILE=".env.hashkey.testnet"
ENV_HASHKEY_TEMPLATE=".env.hashkey.testnet.example"
ENV_HASHKEY_PRIVATE_FILE=".env.hashkey.private"
ENV_BASE_SEPOLIA_FILE=".env.base.sepolia"
ENV_BASE_SEPOLIA_TEMPLATE=".env.base.sepolia.example"
ENV_BASE_SEPOLIA_PRIVATE_FILE=".env.base.sepolia.private"
ENV_CONFLUX_TESTNET_FILE=".env.conflux.testnet"
ENV_CONFLUX_TESTNET_TEMPLATE=".env.conflux.testnet.example"
ENV_CONFLUX_TESTNET_PRIVATE_FILE=".env.conflux.testnet.private"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/switch-env.sh local
  bash scripts/switch-env.sh hashkey [--refresh]
  bash scripts/switch-env.sh base-sepolia [--refresh]
  bash scripts/switch-env.sh conflux-testnet [--refresh]

What it does:
  - Forces the repo root `.env` to become a symlink to the desired config file.
  - local:
      - If `.env.local.anvil` does not exist yet, it copies current `.env` into it.
  - hashkey:
      - If `.env.hashkey.testnet` does not exist yet, it copies `.env.hashkey.testnet.example` (Chain 133 + USDC pinned) into it; if missing, falls back to `.env.example`.
      - With `--refresh`, it re-copies from the same template (fallback `.env.example`).
      - If `.env.hashkey.private` exists, it overlays those key=value pairs into `.env.hashkey.testnet`
        after copy, so secrets (APP_KEY/APP_SECRET, etc.) survive refresh.
  - base-sepolia:
      - If `.env.base.sepolia` does not exist yet, it copies `.env.base.sepolia.example` (Chain 84532 + Circle test USDC) into it; if missing, falls back to `.env.example`.
      - With `--refresh`, it re-copies from the same template (fallback `.env.example`).
      - If `.env.base.sepolia.private` exists, it overlays those key=value pairs into `.env.base.sepolia`
        after copy, so secrets survive refresh.
  - conflux-testnet:
      - If `.env.conflux.testnet` does not exist yet, it copies `.env.conflux.testnet.example` (Core Space + eSpace testnet) into it; if missing, falls back to `.env.example`.
      - With `--refresh`, it re-copies from the same template (fallback `.env.example`).
      - If `.env.conflux.testnet.private` exists, it overlays those key=value pairs into `.env.conflux.testnet`
        after copy, so secrets survive refresh.
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

# Upsert KEY=value into target without sed(1) replacement: values like Neon URLs contain "&",
# which sed treats as "matched text" in the replacement and corrupts the line (duplication).
# Also drops duplicate KEY= lines so repeated overlays do not stack.
upsert_env_key_in_file() {
  local target_file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  local wrote=0
  while IFS= read -r pline || [[ -n "$pline" ]]; do
    if [[ "$pline" == "${key}="* ]]; then
      if [[ $wrote -eq 0 ]]; then
        printf '%s\n' "${key}=${value}"
        wrote=1
      fi
    else
      printf '%s\n' "$pline"
    fi
  done < "$target_file" > "$tmp"
  if [[ $wrote -eq 0 ]]; then
    printf '%s\n' "${key}=${value}" >> "$tmp"
  fi
  mv "$tmp" "$target_file"
}

overlay_env_file() {
  local target_file="$1"
  local overlay_file="$2"

  if [[ ! -f "$overlay_file" ]]; then
    return 0
  fi

  echo "[switch-env] Overlaying $overlay_file into $target_file"

  # Read KEY=VALUE lines from overlay file and upsert into target file.
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip blank lines and comments.
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    if [[ "$line" != *"="* ]]; then
      echo "[switch-env] WARNING: skip invalid env line: $line" >&2
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"

    # Normalize spaces around key to avoid accidental malformed lines.
    key="$(echo "$key" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    if [[ -z "$key" ]]; then
      echo "[switch-env] WARNING: skip empty env key line: $line" >&2
      continue
    fi

    upsert_env_key_in_file "$target_file" "$key" "$value"
  done < "$overlay_file"
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

    hashkey_template_copy() {
      if [[ -f "$ENV_HASHKEY_TEMPLATE" ]]; then
        echo "[switch-env] Using template $ENV_HASHKEY_TEMPLATE -> $ENV_HASHKEY_FILE"
        cp "$ENV_HASHKEY_TEMPLATE" "$ENV_HASHKEY_FILE"
      else
        echo "[switch-env] WARNING: $ENV_HASHKEY_TEMPLATE missing; fallback .env.example" >&2
        cp ".env.example" "$ENV_HASHKEY_FILE"
      fi
    }
    if [[ "$refresh" == "--refresh" ]]; then
      hashkey_template_copy
    else
      if [[ ! -e "$ENV_HASHKEY_FILE" ]]; then
        echo "[switch-env] Creating $ENV_HASHKEY_FILE from HashKey testnet template"
        hashkey_template_copy
      fi
    fi
    overlay_env_file "$ENV_HASHKEY_FILE" "$ENV_HASHKEY_PRIVATE_FILE"
    echo "[switch-env] Switching to hashkey testnet env ($ENV_HASHKEY_FILE)"
    force_link "$ENV_HASHKEY_FILE"
    ;;
  base-sepolia)
    if [[ ! -e "$ENV_LOCAL_FILE" ]]; then
      if [[ -e ".env" ]]; then
        echo "[switch-env] Preserving current .env into $ENV_LOCAL_FILE"
        cp -L ".env" "$ENV_LOCAL_FILE"
      else
        echo "[switch-env] WARNING: .env does not exist; cannot create $ENV_LOCAL_FILE backup" >&2
      fi
    fi

    base_sepolia_template_copy() {
      if [[ -f "$ENV_BASE_SEPOLIA_TEMPLATE" ]]; then
        echo "[switch-env] Using template $ENV_BASE_SEPOLIA_TEMPLATE -> $ENV_BASE_SEPOLIA_FILE"
        cp "$ENV_BASE_SEPOLIA_TEMPLATE" "$ENV_BASE_SEPOLIA_FILE"
      else
        echo "[switch-env] WARNING: $ENV_BASE_SEPOLIA_TEMPLATE missing; fallback .env.example" >&2
        cp ".env.example" "$ENV_BASE_SEPOLIA_FILE"
      fi
    }
    if [[ "$refresh" == "--refresh" ]]; then
      base_sepolia_template_copy
    else
      if [[ ! -e "$ENV_BASE_SEPOLIA_FILE" ]]; then
        echo "[switch-env] Creating $ENV_BASE_SEPOLIA_FILE from Base Sepolia template"
        base_sepolia_template_copy
      fi
    fi
    overlay_env_file "$ENV_BASE_SEPOLIA_FILE" "$ENV_BASE_SEPOLIA_PRIVATE_FILE"
    echo "[switch-env] Switching to Base Sepolia env ($ENV_BASE_SEPOLIA_FILE)"
    force_link "$ENV_BASE_SEPOLIA_FILE"
    ;;
  conflux-testnet)
    if [[ ! -e "$ENV_LOCAL_FILE" ]]; then
      if [[ -e ".env" ]]; then
        echo "[switch-env] Preserving current .env into $ENV_LOCAL_FILE"
        cp -L ".env" "$ENV_LOCAL_FILE"
      else
        echo "[switch-env] WARNING: .env does not exist; cannot create $ENV_LOCAL_FILE backup" >&2
      fi
    fi

    conflux_testnet_template_copy() {
      if [[ -f "$ENV_CONFLUX_TESTNET_TEMPLATE" ]]; then
        echo "[switch-env] Using template $ENV_CONFLUX_TESTNET_TEMPLATE -> $ENV_CONFLUX_TESTNET_FILE"
        cp "$ENV_CONFLUX_TESTNET_TEMPLATE" "$ENV_CONFLUX_TESTNET_FILE"
      else
        echo "[switch-env] WARNING: $ENV_CONFLUX_TESTNET_TEMPLATE missing; fallback .env.example" >&2
        cp ".env.example" "$ENV_CONFLUX_TESTNET_FILE"
      fi
    }
    if [[ "$refresh" == "--refresh" ]]; then
      conflux_testnet_template_copy
    else
      if [[ ! -e "$ENV_CONFLUX_TESTNET_FILE" ]]; then
        echo "[switch-env] Creating $ENV_CONFLUX_TESTNET_FILE from Conflux testnet template"
        conflux_testnet_template_copy
      fi
    fi
    overlay_env_file "$ENV_CONFLUX_TESTNET_FILE" "$ENV_CONFLUX_TESTNET_PRIVATE_FILE"
    echo "[switch-env] Switching to Conflux testnet env ($ENV_CONFLUX_TESTNET_FILE)"
    force_link "$ENV_CONFLUX_TESTNET_FILE"
    ;;
  *)
    echo "[switch-env] ERROR: unknown mode: $mode" >&2
    usage >&2
    exit 1
    ;;
esac

echo "[switch-env] Done. Current .env -> $(readlink .env 2>/dev/null || echo '<not a symlink>')"

