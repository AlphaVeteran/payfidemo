import { Router } from "express";
import crypto from "node:crypto";
import { intentStore } from "../store/intentStore.js";
import { registerEscrowOnChain } from "../chain/escrow.js";

type HashKeyWebhookPayload = {
  cart_mandate_id?: string;
  status?: string;
  tx_signature?: string;
};

const router = Router();
const seenEventIds = new Set<string>();

function parseSignatureHeader(sig: string): { t?: string; v1?: string } {
  const parts = sig.split(",").map((p) => p.trim()).filter(Boolean);
  const kv = Object.fromEntries(
    parts.map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    }),
  );
  return { t: kv.t, v1: kv.v1 };
}

function verifyWebhookSig(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret || !rawBody) return false;
  const { t, v1 } = parseSignatureHeader(signature);
  if (!t || !v1) return false;
  const ts = Number.parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

router.post("/hashkey", async (req, res) => {
  const rawBody =
    typeof (req as { rawBody?: string }).rawBody === "string"
      ? (req as { rawBody?: string }).rawBody!
      : JSON.stringify(req.body ?? {});
  const signature = req.header("x-signature") ?? "";
  const eventId = req.header("x-event-id") ?? req.header("x-request-id") ?? "";
  const secret = process.env.APP_SECRET?.trim() ?? "";

  if (!verifyWebhookSig(rawBody, signature, secret)) {
    res.status(401).json({ error: "invalid signature" });
    return;
  }

  if (eventId && seenEventIds.has(eventId)) {
    res.json({ code: 0, idempotent: true });
    return;
  }
  if (eventId) seenEventIds.add(eventId);

  const payload = (req.body ?? {}) as HashKeyWebhookPayload;
  const intentId = payload.cart_mandate_id?.trim();
  if (!intentId) {
    res.json({ code: 0, ignored: "missing cart_mandate_id" });
    return;
  }

  let intent = await intentStore.getIntent(intentId);
  if (!intent) {
    const all = await intentStore.listIntents();
    intent = all.find((it) => it.hskCartMandateId === intentId);
  }
  if (!intent) {
    res.json({ code: 0, ignored: "intent not found" });
    return;
  }

  if (payload.status === "payment-successful") {
    if (intent.status === "active" || intent.status === "partially_settled" || intent.status === "settled") {
      res.json({ code: 0, idempotent: true });
      return;
    }
    try {
      const txHash = payload.tx_signature?.trim();
      if (!txHash) throw new Error("missing tx_signature");
      const escrowId = await registerEscrowOnChain(intent, txHash);
      intent.fundingTxHash = txHash;
      intent.escrowId = escrowId;
      intent.expiresAt = Math.floor(Date.now() / 1000) + intent.durationSeconds;
      intent.status = "active";
      await intentStore.saveIntent(intent);
      res.json({ code: 0, ok: true, intentId, escrowId });
      return;
    } catch (e) {
      console.error("[hashkey webhook] registerDeposit failed:", e);
      res.json({ code: 0, ok: false, detail: e instanceof Error ? e.message : String(e) });
      return;
    }
  }

  if (payload.status === "payment-failed") {
    intent.status = "expired";
    await intentStore.saveIntent(intent);
    res.json({ code: 0, ok: true, intentId, status: intent.status });
    return;
  }

  res.json({ code: 0, ignored: payload.status ?? "unknown status" });
});

export default router;
