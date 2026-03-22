import "dotenv/config";
import cors from "cors";
import express from "express";
import intentsRouter from "./routes/intents.js";
import { getIntent, saveIntent } from "./store/memory.js";
import { getHspOutbox } from "./services/mockHsp.js";
import { isChainMode } from "./chain/config.js";

const app = express();
app.use(cors());
app.use(express.json());

const API = "/api/payfi/v1";

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "payfidemo",
    chainId: process.env.CHAIN_ID || "31337",
    chainMode: isChainMode(),
    chainRpc: process.env.CHAIN_RPC_URL || null,
    escrowConfigured: Boolean(process.env.ESCROW_ADDRESS?.trim()),
  });
});

app.use(`${API}/intents`, intentsRouter);

app.get(`${API}/debug/hsp-outbox`, (_req, res) => {
  res.json({ events: getHspOutbox(100) });
});

/** 仅本地演示：将 intent 的 expiresAt 设为已过期，便于测 refund */
app.post(`${API}/debug/intents/:intentId/expire`, (req, res) => {
  if (process.env.PAYFIDEMO_DEBUG !== "true") {
    res.status(404).json({ error: "not found" });
    return;
  }
  const row = getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  row.expiresAt = Math.floor(Date.now() / 1000) - 60;
  saveIntent(row);
  res.json({ ok: true, intentId: row.intentId, expiresAt: row.expiresAt });
});

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`payfidemo listening on http://127.0.0.1:${port}`);
  console.log(`health: http://127.0.0.1:${port}/health`);
  console.log(`intents: http://127.0.0.1:${port}${API}/intents`);
});
