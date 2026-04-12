import { isHash } from "viem";

/** 网关回跳 query 中可能出现的交易哈希键名（以 HashKey QA 实测与常见命名为准，可多选兼容）。 */
const TX_QUERY_KEYS_PREFERRED = [
  "tx_hash",
  "transaction_hash",
  "txHash",
  "tx_signature",
  "deposit_tx_hash",
  "payment_tx_hash",
  "funding_tx_hash",
] as const;

function normalizeQueryTxHash(raw: string): `0x${string}` | null {
  const t = raw.trim();
  if (!t) return null;
  if (isHash(t as `0x${string}`)) return t as `0x${string}`;
  if (/^[a-fA-F0-9]{64}$/i.test(t)) {
    return `0x${t.toLowerCase()}` as `0x${string}`;
  }
  return null;
}

/** 网关 API / 本地字段里可能出现的哈希格式（带或不带 0x）。 */
export function normalizeLooseTxHash(raw: string | null | undefined): `0x${string}` | null {
  if (raw == null) return null;
  return normalizeQueryTxHash(String(raw));
}

/**
 * 从支付完成回跳的 URLSearchParams 中解析 EVM 交易哈希（32-byte hex）。
 * 优先匹配已知键名；否则在「键名含 tx/hash/signature/payment 等」的条目中取第一个合法哈希。
 */
export function pickTxHashFromSearchParams(searchParams: URLSearchParams): `0x${string}` | null {
  for (const key of TX_QUERY_KEYS_PREFERRED) {
    const v = searchParams.get(key);
    const n = v ? normalizeQueryTxHash(v) : null;
    if (n) return n;
  }
  for (const [key, value] of searchParams.entries()) {
    if (!value?.trim()) continue;
    const lk = key.toLowerCase();
    if (
      !/tx|hash|signature|payment|deposit|funding|transaction/.test(lk) ||
      /intent|cart|mandate|session|state|nonce|code|error/i.test(lk)
    ) {
      continue;
    }
    const n = normalizeQueryTxHash(value);
    if (n) return n;
  }
  return null;
}
