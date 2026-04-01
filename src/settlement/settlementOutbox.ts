import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { isPersistenceEnabled } from "../db/pool.js";
import type { SettlementEventKind, SettlementOutboxRecord } from "./settlementPort.js";
import { pgAppendSettlementOutbox, pgGetSettlementOutbox } from "./postgresOutbox.js";

const store: SettlementOutboxRecord[] = [];

export type { SettlementOutboxRecord };

function appendMemory(kind: SettlementEventKind, payload: unknown): string {
  const id = randomUUID();
  store.push({
    id,
    kind,
    payload,
    createdAt: new Date().toISOString(),
  });
  return id;
}

function getMemory(limit: number): SettlementOutboxRecord[] {
  return [...store].slice(-limit);
}

export async function appendSettlementOutbox(
  kind: SettlementEventKind,
  payload: unknown,
  client?: PoolClient,
): Promise<string> {
  if (isPersistenceEnabled()) {
    return pgAppendSettlementOutbox(kind, payload, client);
  }
  return appendMemory(kind, payload);
}

export async function getSettlementOutbox(limit = 50): Promise<SettlementOutboxRecord[]> {
  if (isPersistenceEnabled()) {
    return pgGetSettlementOutbox(limit);
  }
  return getMemory(limit);
}
