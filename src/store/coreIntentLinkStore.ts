import { isPersistenceEnabled } from "../db/pool.js";
import type { CoreIntentLinkRecord } from "../types.js";
import {
  getCoreIntentLinkByCoreOrderId as memoryGetByCoreOrderId,
  getCoreIntentLinkByEscrowId as memoryGetByEscrowId,
  getCoreIntentLinkByIntentId as memoryGetByIntentId,
  upsertCoreIntentLink as memoryUpsert,
} from "./memory.js";
import {
  pgGetCoreIntentLinkByCoreOrderId,
  pgGetCoreIntentLinkByEscrowId,
  pgGetCoreIntentLinkByIntentId,
  pgUpsertCoreIntentLink,
} from "./postgresCoreIntentLink.js";

export type CoreIntentLinkStore = {
  getByCoreOrderId(coreOrderId: string): Promise<CoreIntentLinkRecord | undefined>;
  getByEscrowId(escrowId: string): Promise<CoreIntentLinkRecord | undefined>;
  getByIntentId(intentId: string): Promise<CoreIntentLinkRecord | undefined>;
  upsert(record: {
    coreOrderId: string;
    escrowId: string;
    intentId?: string;
    mappedTxHash?: string;
  }): Promise<CoreIntentLinkRecord>;
};

function createStore(): CoreIntentLinkStore {
  if (isPersistenceEnabled()) {
    return {
      getByCoreOrderId: pgGetCoreIntentLinkByCoreOrderId,
      getByEscrowId: pgGetCoreIntentLinkByEscrowId,
      getByIntentId: pgGetCoreIntentLinkByIntentId,
      upsert: pgUpsertCoreIntentLink,
    };
  }
  return {
    getByCoreOrderId: async (coreOrderId) => memoryGetByCoreOrderId(coreOrderId),
    getByEscrowId: async (escrowId) => memoryGetByEscrowId(escrowId),
    getByIntentId: async (intentId) => memoryGetByIntentId(intentId),
    upsert: async (record) => {
      const now = new Date().toISOString();
      const prev = memoryGetByCoreOrderId(record.coreOrderId);
      const next: CoreIntentLinkRecord = {
        coreOrderId: record.coreOrderId,
        escrowId: record.escrowId,
        intentId: record.intentId ?? prev?.intentId,
        mappedTxHash: record.mappedTxHash ?? prev?.mappedTxHash,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      memoryUpsert(next);
      return next;
    },
  };
}

export const coreIntentLinkStore: CoreIntentLinkStore = createStore();

