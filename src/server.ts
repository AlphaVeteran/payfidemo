import "dotenv/config";

process.on("uncaughtException", (err) => {
  console.error("[payfidemo] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[payfidemo] unhandledRejection:", reason);
});
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./db/migrate.js";
import { closePgPool, getPgPool, isPersistenceEnabled } from "./db/pool.js";
import intentsRouter from "./routes/intents.js";
import { intentStore } from "./store/intentStore.js";
import { getSettlementOutbox } from "./settlement/settlementOutbox.js";
import { getWalletChainId, isChainMode } from "./chain/config.js";

const app = express();
app.use(cors());
app.use(express.json());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "../web");

const API = "/api/payfi/v1";

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "payfidemo",
    chainId: process.env.CHAIN_ID || "31337",
    /** viem 签交易使用的链 ID；Anvil 应为 31337。若见 1337 说明进程未加载最新代码或未重启。 */
    walletChainId: getWalletChainId(),
    chainMode: isChainMode(),
    chainRpc: process.env.CHAIN_RPC_URL || null,
    escrowConfigured: Boolean(process.env.ESCROW_ADDRESS?.trim()),
    persistence: isPersistenceEnabled() ? "postgres" : "memory",
  });
});

app.use(`${API}/intents`, intentsRouter);
app.use(express.static(webDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(webDir, "index.html"));
});

async function settlementOutboxDebugHandler(_req: express.Request, res: express.Response) {
  res.json({ events: await getSettlementOutbox(100) });
}

app.get(`${API}/debug/settlement-outbox`, settlementOutboxDebugHandler);
/** @deprecated Use `/debug/settlement-outbox` */
app.get(`${API}/debug/hsp-outbox`, settlementOutboxDebugHandler);

/** 仅本地演示：将 intent 的 expiresAt 设为已过期，便于测 refund */
app.post(`${API}/debug/intents/:intentId/expire`, async (req, res) => {
  if (process.env.PAYFIDEMO_DEBUG !== "true") {
    res.status(404).json({ error: "not found" });
    return;
  }
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  row.expiresAt = Math.floor(Date.now() / 1000) - 60;
  await intentStore.saveIntent(row);
  res.json({ ok: true, intentId: row.intentId, expiresAt: row.expiresAt });
});

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

const port = Number(process.env.PORT || 8787);

async function main() {
  const pool = getPgPool();
  if (pool) {
    await runMigrations(pool);
    console.log("[payfidemo] Postgres persistence enabled (DATABASE_URL)");
  }

  const server = app.listen(port, () => {
    console.log(`payfidemo listening on http://127.0.0.1:${port}`);
    console.log(`health: http://127.0.0.1:${port}/health`);
    console.log(`intents: http://127.0.0.1:${port}${API}/intents`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[payfidemo] Port ${port} is already in use. Stop the other listener, e.g.:\n` +
          `  lsof -nP -iTCP:${port} -sTCP:LISTEN\n` +
          `  kill $(lsof -ti :${port})\n` +
          `Or run with a different port: PORT=8788 npm run dev`,
      );
    } else {
      console.error("[payfidemo] listen error:", err);
    }
    void closePgPool();
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => {
      void closePgPool().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[payfidemo] failed to start:", err);
  void closePgPool().finally(() => process.exit(1));
});
