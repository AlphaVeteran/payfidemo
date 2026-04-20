import type { Pool } from "pg";
import { getPgPool } from "../db/pool.js";
import { withPgTransientRetry } from "../db/pgTransientRetry.js";
import type { CoreIntentLinkRecord } from "../types.js";

function pool(): Pool {
  const p = getPgPool();
  if (!p) throw new Error("postgres core-intent link store requires DATABASE_URL");
  return p;
}

function toRecord(row: {
  core_order_id: string;
  escrow_id: string;
  intent_id: string | null;
  mapped_tx_hash: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): CoreIntentLinkRecord {
  return {
    coreOrderId: row.core_order_id,
    escrowId: row.escrow_id,
    intentId: row.intent_id ?? undefined,
    mappedTxHash: row.mapped_tx_hash ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function pgGetCoreIntentLinkByCoreOrderId(
  coreOrderId: string,
): Promise<CoreIntentLinkRecord | undefined> {
  return withPgTransientRetry(async () => {
  const { rows } = await pool().query<{
    core_order_id: string;
    escrow_id: string;
    intent_id: string | null;
    mapped_tx_hash: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT core_order_id, escrow_id, intent_id, mapped_tx_hash, created_at, updated_at
     FROM payfi_core_intent_links
     WHERE core_order_id = $1`,
    [coreOrderId],
  );
  return rows[0] ? toRecord(rows[0]) : undefined;
  });
}

export async function pgGetCoreIntentLinkByEscrowId(
  escrowId: string,
): Promise<CoreIntentLinkRecord | undefined> {
  return withPgTransientRetry(async () => {
  const { rows } = await pool().query<{
    core_order_id: string;
    escrow_id: string;
    intent_id: string | null;
    mapped_tx_hash: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT core_order_id, escrow_id, intent_id, mapped_tx_hash, created_at, updated_at
     FROM payfi_core_intent_links
     WHERE escrow_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [escrowId],
  );
  return rows[0] ? toRecord(rows[0]) : undefined;
  });
}

export async function pgGetCoreIntentLinkByIntentId(
  intentId: string,
): Promise<CoreIntentLinkRecord | undefined> {
  return withPgTransientRetry(async () => {
  const { rows } = await pool().query<{
    core_order_id: string;
    escrow_id: string;
    intent_id: string | null;
    mapped_tx_hash: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `SELECT core_order_id, escrow_id, intent_id, mapped_tx_hash, created_at, updated_at
     FROM payfi_core_intent_links
     WHERE intent_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [intentId],
  );
  return rows[0] ? toRecord(rows[0]) : undefined;
  });
}

export async function pgUpsertCoreIntentLink(record: {
  coreOrderId: string;
  escrowId: string;
  intentId?: string;
  mappedTxHash?: string;
}): Promise<CoreIntentLinkRecord> {
  return withPgTransientRetry(async () => {
  const { rows } = await pool().query<{
    core_order_id: string;
    escrow_id: string;
    intent_id: string | null;
    mapped_tx_hash: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `INSERT INTO payfi_core_intent_links (core_order_id, escrow_id, intent_id, mapped_tx_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (core_order_id) DO UPDATE SET
       escrow_id = EXCLUDED.escrow_id,
       intent_id = COALESCE(EXCLUDED.intent_id, payfi_core_intent_links.intent_id),
       mapped_tx_hash = COALESCE(EXCLUDED.mapped_tx_hash, payfi_core_intent_links.mapped_tx_hash),
       updated_at = now()
     RETURNING core_order_id, escrow_id, intent_id, mapped_tx_hash, created_at, updated_at`,
    [record.coreOrderId, record.escrowId, record.intentId ?? null, record.mappedTxHash ?? null],
  );
  return toRecord(rows[0]!);
  });
}
