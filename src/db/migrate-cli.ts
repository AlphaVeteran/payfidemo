import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePgPool, getPgPool } from "./pool.js";
import { runMigrations } from "./migrate.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

async function main() {
  const pool = getPgPool();
  if (!pool) {
    console.error(
      "[payfidemo] DATABASE_URL is not set; nothing to migrate.\n" +
        "  → In repo root, copy .env.example to .env and set DATABASE_URL=postgres://...\n" +
        `  → Repo root detected: ${repoRoot}`,
    );
    process.exit(1);
  }
  try {
    await runMigrations(pool);
    console.log("[payfidemo] Migrations applied (payfi_intents, payfi_settlement_outbox).");
  } finally {
    await closePgPool();
  }
}

main().catch((err) => {
  console.error("[payfidemo] db:migrate failed:", err);
  void closePgPool().finally(() => process.exit(1));
});
