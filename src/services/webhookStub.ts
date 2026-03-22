import { createHmac, randomUUID } from "node:crypto";

/**
 * Demo: log only. Production would POST to webhookUrl with retries.
 */
export function dispatchWebhookDemo(params: {
  webhookUrl?: string;
  webhookSecret?: string;
  type: string;
  body: Record<string, unknown>;
}): { eventId: string; delivered: boolean } {
  const eventId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = JSON.stringify({ ...params.body, eventId, type: params.type });
  if (!params.webhookUrl) {
    console.log(`[Webhook:skipped] ${params.type}`, payload);
    return { eventId, delivered: false };
  }
  const sig = params.webhookSecret
    ? createHmac("sha256", params.webhookSecret).update(`${timestamp}.${payload}`).digest("hex")
    : "demo-no-secret";
  console.log(`[Webhook:demo] POST ${params.webhookUrl}`, {
    "X-PayFi-Event-Id": eventId,
    "X-PayFi-Timestamp": timestamp,
    "X-PayFi-Signature": sig,
    body: payload,
  });
  return { eventId, delivered: true };
}
