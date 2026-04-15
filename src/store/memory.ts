import type { CoreIntentLinkRecord, IntentRecord } from "../types.js";

const intents = new Map<string, IntentRecord>();
const coreIntentLinksByCoreOrderId = new Map<string, CoreIntentLinkRecord>();
const coreOrderIdByEscrowId = new Map<string, string>();
const coreOrderIdByIntentId = new Map<string, string>();

export function saveIntent(record: IntentRecord): void {
  intents.set(record.intentId, record);
}

export function getIntent(intentId: string): IntentRecord | undefined {
  return intents.get(intentId);
}

export function listIntents(): IntentRecord[] {
  return [...intents.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function upsertCoreIntentLink(record: CoreIntentLinkRecord): void {
  coreIntentLinksByCoreOrderId.set(record.coreOrderId, record);
  coreOrderIdByEscrowId.set(record.escrowId, record.coreOrderId);
  if (record.intentId?.trim()) {
    coreOrderIdByIntentId.set(record.intentId, record.coreOrderId);
  }
}

export function getCoreIntentLinkByCoreOrderId(coreOrderId: string): CoreIntentLinkRecord | undefined {
  return coreIntentLinksByCoreOrderId.get(coreOrderId);
}

export function getCoreIntentLinkByEscrowId(escrowId: string): CoreIntentLinkRecord | undefined {
  const coreOrderId = coreOrderIdByEscrowId.get(escrowId);
  if (!coreOrderId) return undefined;
  return coreIntentLinksByCoreOrderId.get(coreOrderId);
}

export function getCoreIntentLinkByIntentId(intentId: string): CoreIntentLinkRecord | undefined {
  const coreOrderId = coreOrderIdByIntentId.get(intentId);
  if (!coreOrderId) return undefined;
  return coreIntentLinksByCoreOrderId.get(coreOrderId);
}
