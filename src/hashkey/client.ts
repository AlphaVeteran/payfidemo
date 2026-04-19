import { getAddress } from "viem";
import { buildHmacHeaders } from "./auth.js";
import { canonicalStringify } from "./canonical.js";
import { buildMerchantJWT } from "./jwt.js";

const HSK_REUSABLE_PATH = "/api/v1/merchant/orders/reusable";
const HSK_PAYMENTS_QUERY_PATH = "/api/v1/merchant/payments";

type ReusableOrderResponse = {
  data?: {
    payment_url?: string;
    payment_request_id?: string;
  };
};

/** Doc examples use `2024-03-01T12:00:00Z` without fractional seconds. */
function cartExpiryIsoSeconds(): string {
  return new Date(Date.now() + 365 * 86400 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toUsdDisplayFromSixDecimals(amountInSmallest: string): string {
  const raw = BigInt(amountInSmallest);
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  if (frac === 0n) return whole.toString();
  const fracTrimmed = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracTrimmed}`;
}

export function buildCartContents(intent: {
  intentId: string;
  merchant: string;
  amountTotal: string;
}) {
  const usdc = process.env.USDC_CONTRACT?.trim();
  const escrow = process.env.ESCROW_ADDRESS?.trim();
  const network =
    process.env.HASHKEY_CART_NETWORK?.trim() || process.env.CHAIN_NETWORK?.trim();
  const chainId = Number(process.env.CHAIN_ID);
  const merchantName = process.env.MERCHANT_NAME?.trim();
  if (!usdc || !escrow || !network || !Number.isFinite(chainId) || !merchantName) {
    throw new Error("CHAIN_NETWORK, CHAIN_ID, USDC_CONTRACT, ESCROW_ADDRESS, MERCHANT_NAME are required");
  }

  const amountUsd = toUsdDisplayFromSixDecimals(intent.amountTotal);
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now.toString();
  const validBefore = (now + 3600).toString();
  const paymentRequestId = `PAY-REQ-${intent.intentId}`;
  return {
    id: intent.intentId,
    user_cart_confirmation_required: true,
    payment_request: {
      method_data: [
        {
          supported_methods: "https://www.x402.org/",
          data: {
            x402Version: 2,
            network,
            chain_id: chainId,
            contract_address: getAddress(usdc as `0x${string}`),
            pay_to: getAddress(escrow as `0x${string}`),
            coin: "USDC",
            schema: "eip3009",
            valid_after: validAfter,
            valid_before: validBefore,
          },
        },
      ],
      details: {
        id: paymentRequestId,
        display_items: [
          {
            label: "PayFi Escrow Deposit",
            amount: { currency: "USD", value: amountUsd },
          },
        ],
        total: {
          label: "Total",
          amount: { currency: "USD", value: amountUsd },
        },
      },
    },
    cart_expiry: cartExpiryIsoSeconds(),
    merchant_name: merchantName,
  };
}

/**
 * 支付完成回跳地址：在商户配置的 `redirect_url` 上固定带上 `intentId`，
 * 落地页据此调用 `POST .../funding/tx`。须为绝对 URL（含协议与 host）。
 */
export function appendIntentIdToRedirectUrl(redirectUrl: string, intentId: string): string {
  const trimmed = redirectUrl.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid HashKey redirect_url (must be absolute URL, e.g. https://host/payment/result): ${trimmed}`,
    );
  }
  u.searchParams.set("intentId", intentId);
  return u.toString();
}

/** True when env has everything `createReusableOrder` needs (Conflux-only deploys can omit HashKey). */
export function isHashKeyReusableOrderConfigured(): boolean {
  if (!process.env.HASHKEY_BASE_URL?.trim()) return false;
  if (!process.env.APP_KEY?.trim()) return false;
  if (!process.env.APP_SECRET?.trim()) return false;
  const redirectFixed = process.env.HASHKEY_REDIRECT_URL?.trim();
  const baseUrlForRedirect = process.env.BASE_URL?.trim() ?? "";
  if (!redirectFixed && !baseUrlForRedirect) return false;
  const usdc = process.env.USDC_CONTRACT?.trim();
  const escrow = process.env.ESCROW_ADDRESS?.trim();
  const network =
    process.env.HASHKEY_CART_NETWORK?.trim() || process.env.CHAIN_NETWORK?.trim();
  const chainId = Number(process.env.CHAIN_ID);
  const merchantName = process.env.MERCHANT_NAME?.trim();
  if (!usdc || !escrow || !network || !Number.isFinite(chainId) || !merchantName) return false;
  return true;
}

export async function createReusableOrder(input: {
  intentId: string;
  merchant: string;
  amountTotal: string;
}) {
  /** Conflux-only API 部署常不配 HashKey；早退可避免抛错及 `[HashKey] createReusableOrder failed` 日志（亦兼容未更新 intents 路由的旧镜像）。 */
  if (!isHashKeyReusableOrderConfigured()) {
    return {
      paymentUrl: "",
      paymentRequestId: "",
      cartMandateId: undefined,
      raw: undefined,
    };
  }

  const baseUrl = process.env.HASHKEY_BASE_URL?.trim();
  const appKey = process.env.APP_KEY?.trim();
  const appSecret = process.env.APP_SECRET?.trim();
  if (!baseUrl) throw new Error("HASHKEY_BASE_URL is required");
  if (!appKey) throw new Error("APP_KEY is required");
  if (!appSecret) throw new Error("APP_SECRET is required");

  const contents = buildCartContents(input);
  const jwt = await buildMerchantJWT(contents);
  const merchantId = process.env.HASHKEY_MERCHANT_ID?.trim() || appKey;
  const requestBody: Record<string, unknown> = {
    merchant_id: merchantId,
    cart_mandate: {
      contents,
      merchant_authorization: jwt,
    },
  };
  const redirectFixed = process.env.HASHKEY_REDIRECT_URL?.trim();
  const baseUrlForRedirect = process.env.BASE_URL?.trim() ?? "";
  let rawRedirect = "";
  if (redirectFixed) {
    rawRedirect = redirectFixed;
  } else if (baseUrlForRedirect) {
    const base = baseUrlForRedirect.replace(/\/$/, "");
    rawRedirect = `${base}/payment/result`;
  }
  if (!rawRedirect.trim()) {
    throw new Error(
      "HashKey reusable order needs redirect_url: set HASHKEY_REDIRECT_URL or BASE_URL in .env (see .env.example)",
    );
  }
  requestBody.redirect_url = appendIntentIdToRedirectUrl(rawRedirect, input.intentId);
  const body = canonicalStringify(requestBody as object);

  const headers = buildHmacHeaders({
    method: "POST",
    path: HSK_REUSABLE_PATH,
    query: "",
    body,
    appKey,
    appSecret,
  });

  const res = await fetch(`${baseUrl}${HSK_REUSABLE_PATH}`, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HashKey API error ${res.status}: ${text}`);

  let data: ReusableOrderResponse;
  try {
    data = JSON.parse(text) as ReusableOrderResponse;
  } catch {
    throw new Error("HashKey API returned non-JSON response");
  }

  return {
    paymentUrl: data.data?.payment_url ?? "",
    paymentRequestId: data.data?.payment_request_id ?? "",
    cartMandateId: contents.id,
    raw: data,
  };
}

/** Merchant manual: GET /api/v1/merchant/payments — exactly one filter. */
export type MerchantPaymentItem = {
  payment_request_id?: string;
  request_id?: string;
  cart_mandate_id?: string;
  /** Checkout / payment flow instance — use GET /payments?flow_id= for the row that carries tx after pay */
  flow_id?: string;
  status?: string;
  tx_signature?: string;
  completed_at?: string;
  chain?: string;
  network?: string;
  amount?: string;
  token?: string;
  risk_level?: string;
  payer_address?: string;
  created_at?: string;
  [key: string]: unknown;
};

export type MerchantPaymentsEnvelope = {
  code?: number;
  msg?: string;
  data?: unknown;
};

function normalizePaymentRows(data: unknown): MerchantPaymentItem[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as MerchantPaymentItem[];
  if (typeof data === "object" && data !== null) {
    const o = data as Record<string, unknown>;
    for (const k of ["list", "records", "items", "payments"] as const) {
      const arr = o[k];
      if (Array.isArray(arr)) return arr as MerchantPaymentItem[];
    }
  }
  return [data as MerchantPaymentItem];
}

/** Normalize 32-byte EVM tx hashes (explorer + comparisons; accepts with or without 0x). */
export function normalizeMaybeTxHash(s: string): string | null {
  const t = s.trim();
  if (/^0x[a-fA-F0-9]{64}$/i.test(t)) return `0x${t.slice(2).toLowerCase()}`;
  if (/^[a-fA-F0-9]{64}$/i.test(t)) return `0x${t.toLowerCase()}`;
  return null;
}

/** True if the string can be normalized to a 32-byte hex tx hash. */
export function isPlausibleEvmTxHash(s: string): boolean {
  return normalizeMaybeTxHash(s) !== null;
}

/** Score a JSON leaf key + path so we only treat transaction-like fields as tx hashes (not agreementHash, etc.). */
function scoreKeyForTxExtraction(leafKey: string, fullPath: string): number {
  const lk = leafKey.toLowerCase();
  const fp = fullPath.toLowerCase();
  if (/agreement|anchor|merkle|mandate_jwt|authorization|invoice_digest|user_cart|preimage/.test(lk)) return -1;
  if (lk === "hash" && /agreement|anchor|\.cart\.|mandate[^_]|jwt/.test(fp)) return -1;
  if (lk === "tx_signature") return 100;
  if (lk === "transaction_hash" || lk === "tx_hash") return 95;
  if (/^(deposit|payment|funding)_(tx|hash|signature)$/.test(lk)) return 92;
  if (lk === "signature" && /payment|merchant|gateway|deposit|transfer|chain|block|tx/.test(fp)) return 86;
  if (lk === "value" && /transaction|payment|transfer|chain|deposit/.test(fp)) return 48;
  if (lk.includes("chain") && /tx|hash|signature/.test(lk)) return 88;
  if (lk === "hash" && /transaction|payment|transfer|chain|deposit|settlement|block/.test(fp)) return 78;
  if (/tx|signature|transaction|receipt|transfer/.test(lk) && !/user_address|merchant_address|payer|payee/.test(lk))
    return 62;
  return -1;
}

/**
 * Collect normalized tx hashes from an arbitrary JSON subtree with scores (higher = more likely on-chain tx).
 */
export function collectScoredTxCandidates(raw: unknown, maxDepth = 18): Map<string, number> {
  const map = new Map<string, number>();
  function walk(v: unknown, segments: string[], depth: number): void {
    if (depth > maxDepth) return;
    if (typeof v === "string") {
      const n = normalizeMaybeTxHash(v);
      if (!n) return;
      const leaf =
        [...segments].reverse().find((s) => !/^\d+$/.test(s)) ??
        (segments.length ? segments[segments.length - 1]! : "");
      const path = segments.join(".");
      const s = scoreKeyForTxExtraction(leaf, path);
      if (s < 0) return;
      map.set(n, Math.max(map.get(n) ?? -1, s));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((el, i) => walk(el, [...segments, String(i)], depth + 1));
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        walk(child, [...segments, k], depth + 1);
      }
    }
  }
  walk(raw, [], 0);
  return map;
}

function pickBestHashFromCandidateMap(map: Map<string, number>, localHint: string | null): string {
  if (localHint && map.has(localHint)) return localHint;
  let best = "";
  let bestScore = -1;
  for (const [h, s] of map) {
    if (s > bestScore) {
      bestScore = s;
      best = h;
    } else if (s === bestScore && h < best) {
      best = h;
    }
  }
  return bestScore >= 0 ? best : "";
}

/**
 * HashKey GET /merchant/payments may expose the on-chain tx under different keys or deep JSON
 * (e.g. after multiple releases). Use scored walk instead of a fixed key list.
 */
export function extractMerchantPaymentTxHash(item: unknown): string {
  const map = collectScoredTxCandidates(item, 14);
  return pickBestHashFromCandidateMap(map, null);
}

/**
 * Prefer the row that matches cart / payment-request id and carries a tx hash; otherwise
 * any row with a hash (multi-row responses often put an empty summary first after releases).
 */
export function pickGatewayReconciliationRow(
  items: MerchantPaymentItem[],
  ids: { cartMandateId?: string | null; paymentRequestId?: string | null },
): { primary: MerchantPaymentItem | null; gatewayTx: string } {
  if (!items.length) return { primary: null, gatewayTx: "" };

  const mandateOk = (it: MerchantPaymentItem) => {
    const cm = ids.cartMandateId?.trim();
    const pr = ids.paymentRequestId?.trim();
    if (cm && typeof it.cart_mandate_id === "string" && it.cart_mandate_id.trim() === cm) return true;
    if (pr && typeof it.payment_request_id === "string" && it.payment_request_id.trim() === pr)
      return true;
    if (pr && typeof it.request_id === "string" && it.request_id.trim() === pr) return true;
    return false;
  };

  const txFor = (it: MerchantPaymentItem) => extractMerchantPaymentTxHash(it);

  const idMatchedWithTx = items.find((it) => mandateOk(it) && txFor(it));
  if (idMatchedWithTx) {
    return { primary: idMatchedWithTx, gatewayTx: txFor(idMatchedWithTx) };
  }
  const anyWithTx = items.find((it) => txFor(it));
  if (anyWithTx) {
    return { primary: anyWithTx, gatewayTx: txFor(anyWithTx) };
  }
  const idMatched = items.find((it) => mandateOk(it));
  return {
    primary: idMatched ?? items[0] ?? null,
    gatewayTx: "",
  };
}

/**
 * If no hash on payment rows, scan full `envelope.data` (timeline/history objects, alternate shapes).
 * When `localFundingTxHash` is set, prefer the same hash among multiple candidates (deposit vs later txs).
 */
export function resolveGatewayTxForReconciliation(
  items: MerchantPaymentItem[],
  ids: { cartMandateId?: string | null; paymentRequestId?: string | null },
  rawData: unknown,
  localFundingTxHash?: string | null,
): { primary: MerchantPaymentItem | null; gatewayTx: string } {
  const picked = pickGatewayReconciliationRow(items, ids);
  if (picked.gatewayTx) return picked;
  const hint = localFundingTxHash?.trim() ? normalizeMaybeTxHash(localFundingTxHash.trim()) : null;
  const map = collectScoredTxCandidates(rawData, 20);
  const fromDeep = pickBestHashFromCandidateMap(map, hint);
  return { primary: picked.primary, gatewayTx: fromDeep };
}

const FLOW_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Collect UUID flow_ids from payment API JSON (stub rows often include `flow_id` while tx lives on the flow-scoped query). */
export function collectFlowIdsFromPaymentPayload(raw: unknown, max = 8): string[] {
  const seen = new Set<string>();
  function walk(v: unknown, depth: number): void {
    if (depth > 24) return;
    if (v == null) return;
    if (typeof v === "string") return;
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if ((k === "flow_id" || k === "flowId") && typeof val === "string") {
        const t = val.trim();
        if (FLOW_ID_RE.test(t)) seen.add(t);
      } else {
        walk(val, depth + 1);
      }
    }
  }
  walk(raw, 0);
  return [...seen].slice(0, max);
}

export async function queryMerchantPayments(params: {
  cartMandateId?: string;
  paymentRequestId?: string;
  flowId?: string;
}): Promise<{ envelope: MerchantPaymentsEnvelope; items: MerchantPaymentItem[] }> {
  const { cartMandateId, paymentRequestId, flowId } = params;
  const filters = [
    cartMandateId != null && cartMandateId !== "" ? (["cart_mandate_id", cartMandateId] as const) : null,
    paymentRequestId != null && paymentRequestId !== ""
      ? (["payment_request_id", paymentRequestId] as const)
      : null,
    flowId != null && flowId !== "" ? (["flow_id", flowId] as const) : null,
  ].filter(Boolean) as [string, string][];

  if (filters.length !== 1) {
    throw new Error("Provide exactly one of cartMandateId, paymentRequestId, or flowId");
  }

  const sp = new URLSearchParams([filters[0]!]);
  const query = `?${sp.toString()}`;

  const baseUrl = process.env.HASHKEY_BASE_URL?.trim();
  const appKey = process.env.APP_KEY?.trim();
  const appSecret = process.env.APP_SECRET?.trim();
  if (!baseUrl) throw new Error("HASHKEY_BASE_URL is required");
  if (!appKey) throw new Error("APP_KEY is required");
  if (!appSecret) throw new Error("APP_SECRET is required");

  const headers = buildHmacHeaders({
    method: "GET",
    path: HSK_PAYMENTS_QUERY_PATH,
    query,
    body: "",
    appKey,
    appSecret,
  });

  const res = await fetch(`${baseUrl}${HSK_PAYMENTS_QUERY_PATH}${query}`, {
    method: "GET",
    headers,
  });
  const text = await res.text();
  let envelope: MerchantPaymentsEnvelope;
  try {
    envelope = JSON.parse(text) as MerchantPaymentsEnvelope;
  } catch {
    throw new Error(`HashKey payments API returned non-JSON (${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    throw new Error(`HashKey payments API error ${res.status}: ${text.slice(0, 800)}`);
  }
  const items = normalizePaymentRows(envelope.data);
  return { envelope, items };
}
