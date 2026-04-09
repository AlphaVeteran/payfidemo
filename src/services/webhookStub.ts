import { createHmac, randomUUID } from "node:crypto";
import { safeJsonStringify } from "../util/safeJson.js";

const DEFAULT_TIMEOUT_MS = 15_000;

function webhookTimeoutMs(): number {
  const raw = process.env.WEBHOOK_TIMEOUT_MS;
  if (!raw?.trim()) return DEFAULT_TIMEOUT_MS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1_000 || n > 120_000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return n;
}

function isAllowedWebhookUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type WebhookDispatchResult = {
  eventId: string;
  delivered: boolean;
  error?: string;
};

/**
 * POST JSON to `webhookUrl` with HMAC headers. Errors are logged and swallowed
 * (returns `delivered: false`) so intent handlers are not aborted.
 */
export async function dispatchWebhookDemo(params: {
  webhookUrl?: string;
  webhookSecret?: string;
  type: string;
  body: Record<string, unknown>;
}): Promise<WebhookDispatchResult> {
  const eventId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = safeJsonStringify({ ...params.body, eventId, type: params.type });

  if (!params.webhookUrl?.trim()) {
    console.log(`[Webhook:skipped] ${params.type}`, payload);
    return { eventId, delivered: false };
  }

  const url = params.webhookUrl.trim();
  if (!isAllowedWebhookUrl(url)) {
    console.warn(`[Webhook:invalid-url] ${params.type}`, url);
    return { eventId, delivered: false, error: "invalid webhook URL" };
  }

  const sig = params.webhookSecret
    ? createHmac("sha256", params.webhookSecret).update(`${timestamp}.${payload}`).digest("hex")
    : "demo-no-secret";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-PayFi-Event-Id": eventId,
    "X-PayFi-Timestamp": timestamp,
    "X-PayFi-Signature": sig,
  };

  const timeoutMs = webhookTimeoutMs();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payload,
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errMsg = `HTTP ${res.status}`;
      console.warn(`[Webhook:failed] ${params.type}`, url, errMsg);
      return { eventId, delivered: false, error: errMsg };
    }

    console.log(`[Webhook:ok] ${params.type}`, url, { eventId, status: res.status });
    return { eventId, delivered: true };
  } catch (e) {
    clearTimeout(timer);
    const isAbort =
      (e instanceof Error && e.name === "AbortError") ||
      (typeof e === "object" &&
        e !== null &&
        "name" in e &&
        (e as { name?: string }).name === "AbortError");
    const msg = e instanceof Error ? e.message : String(e);
    const detail = isAbort ? `timeout after ${timeoutMs}ms` : msg;
    console.warn(`[Webhook:error] ${params.type}`, url, detail);
    return { eventId, delivered: false, error: detail };
  }
}
