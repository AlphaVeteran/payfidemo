import type { IntentRecord } from "../types.js";

const intents = new Map<string, IntentRecord>();

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
