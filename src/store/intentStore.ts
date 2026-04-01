import { isPersistenceEnabled } from "../db/pool.js";
import type { IntentRecord } from "../types.js";
import { getIntent as memoryGetIntent, listIntents as memoryListIntents, saveIntent as memorySaveIntent } from "./memory.js";
import { pgGetIntent, pgListIntents, pgSaveIntent } from "./postgresIntent.js";

export type IntentStore = {
  getIntent(intentId: string): Promise<IntentRecord | undefined>;
  saveIntent(record: IntentRecord): Promise<void>;
  listIntents(): Promise<IntentRecord[]>;
};

function createIntentStore(): IntentStore {
  if (isPersistenceEnabled()) {
    return {
      getIntent: pgGetIntent,
      saveIntent: pgSaveIntent,
      listIntents: pgListIntents,
    };
  }
  return {
    getIntent: async (id) => memoryGetIntent(id),
    saveIntent: async (r) => {
      memorySaveIntent(r);
    },
    listIntents: async () => memoryListIntents(),
  };
}

export const intentStore: IntentStore = createIntentStore();
