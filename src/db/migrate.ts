import type { Pool } from "pg";

export async function runMigrations(client: Pool): Promise<void> {
  await client.query(`
CREATE TABLE IF NOT EXISTS payfi_intents (
  intent_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payfi_intents_updated
  ON payfi_intents (updated_at DESC);

CREATE TABLE IF NOT EXISTS payfi_settlement_outbox (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payfi_outbox_created
  ON payfi_settlement_outbox (created_at DESC);

CREATE TABLE IF NOT EXISTS payfi_core_intent_links (
  core_order_id TEXT PRIMARY KEY,
  escrow_id TEXT NOT NULL,
  intent_id TEXT,
  mapped_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payfi_core_links_escrow
  ON payfi_core_intent_links (escrow_id);

CREATE INDEX IF NOT EXISTS idx_payfi_core_links_intent
  ON payfi_core_intent_links (intent_id);
  `);
}
