import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { getPgPool } from "../db/pool.js";
import { withPgTransientRetry } from "../db/pgTransientRetry.js";
import type { SettlementEventKind, SettlementOutboxRecord } from "./settlementPort.js";

function pool(): Pool {
  const p = getPgPool();
  if (!p) throw new Error("postgres outbox requires DATABASE_URL");
  return p;
}

export async function pgAppendSettlementOutbox(
  kind: SettlementEventKind,
  payload: unknown,
  client?: PoolClient,
): Promise<string> {
  const id = randomUUID();
  if (client) {
    await client.query(
      `INSERT INTO payfi_settlement_outbox (id, kind, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [id, kind, payload == null ? null : payload],
    );
    return id;
  }
  await withPgTransientRetry(async () => {
    await pool().query(
      `INSERT INTO payfi_settlement_outbox (id, kind, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [id, kind, payload == null ? null : payload],
    );
  });
  return id;
}

export async function pgGetSettlementOutbox(limit: number): Promise<SettlementOutboxRecord[]> {
  return withPgTransientRetry(async () => {
  const { rows } = await pool().query<{
    id: string;
    kind: string;
    payload: unknown;
    created_at: Date;
  }>(
    `SELECT id, kind, payload, created_at
     FROM payfi_settlement_outbox
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows
    .reverse()
    .map((r: { id: string; kind: string; payload: unknown; created_at: Date }) => ({
      id: r.id,
      kind: r.kind as SettlementEventKind,
      payload: r.payload,
      createdAt: r.created_at.toISOString(),
    }));
  });
}
