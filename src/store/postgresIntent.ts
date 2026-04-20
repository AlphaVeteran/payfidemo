import type { Pool, PoolClient } from "pg";
import { getPgPool } from "../db/pool.js";
import { withPgTransientRetry } from "../db/pgTransientRetry.js";
import type { IntentRecord } from "../types.js";

function pool(): Pool {
  const p = getPgPool();
  if (!p) throw new Error("postgres intent store requires DATABASE_URL");
  return p;
}

export async function pgGetIntent(intentId: string): Promise<IntentRecord | undefined> {
  return withPgTransientRetry(async () => {
    const { rows } = await pool().query<{ payload: IntentRecord }>(
      "SELECT payload FROM payfi_intents WHERE intent_id = $1",
      [intentId],
    );
    return rows[0]?.payload;
  });
}

export async function pgSaveIntent(record: IntentRecord, client?: PoolClient): Promise<void> {
  if (client) {
    await client.query(
      `INSERT INTO payfi_intents (intent_id, payload, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (intent_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = now()`,
      [record.intentId, record],
    );
    return;
  }
  await withPgTransientRetry(async () => {
    await pool().query(
      `INSERT INTO payfi_intents (intent_id, payload, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (intent_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = now()`,
      [record.intentId, record],
    );
  });
}

export async function pgListIntents(): Promise<IntentRecord[]> {
  return withPgTransientRetry(async () => {
    const { rows } = await pool().query<{ payload: IntentRecord }>(
      "SELECT payload FROM payfi_intents ORDER BY updated_at DESC",
    );
    return rows.map((r: { payload: IntentRecord }) => r.payload);
  });
}
