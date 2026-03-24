import { randomUUID } from "node:crypto";
import { safeJsonStringify } from "../util/safeJson.js";

export type HspKind =
  | "INTENT_CREATED"
  | "INTENT_FUNDED"
  | "SETTLEMENT_RELEASED"
  | "INTENT_REFUNDED";

const outbox: Array<{
  id: string;
  kind: HspKind;
  payload: unknown;
  createdAt: string;
}> = [];

export function emitMockHsp(kind: HspKind, payload: unknown): string {
  const id = randomUUID();
  const row = {
    id,
    kind,
    payload,
    createdAt: new Date().toISOString(),
  };
  outbox.push(row);
  console.log(`[MockHSP] ${kind}`, safeJsonStringify(payload));
  return id;
}

export function getHspOutbox(limit = 50) {
  return [...outbox].slice(-limit);
}
