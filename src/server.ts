import "dotenv/config";

process.on("uncaughtException", (err) => {
  console.error("[payfidemo] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[payfidemo] unhandledRejection:", reason);
});
import cors from "cors";
import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./db/migrate.js";
import { closePgPool, getDatabaseProductLabel, getPgPool, isPersistenceEnabled } from "./db/pool.js";
import intentsRouter from "./routes/intents.js";
import hashkeyWebhookRouter from "./routes/webhook.js";
import { intentStore } from "./store/intentStore.js";
import { getSettlementOutbox } from "./settlement/settlementOutbox.js";
import { getWalletChainId, isChainMode } from "./chain/config.js";

const app = express();
// Chrome Private Network Access: a tab on `http://localhost:*` fetching `http://127.0.0.1:*`
// (different origins) requires `Access-Control-Allow-Private-Network` on the preflight/response,
// or `/health` and API calls fail from the Next.js home page.
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});
app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  }),
);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "../web");
const repoRootDir = path.resolve(__dirname, "..");
const crossSpaceDemoScriptPath = path.resolve(repoRootDir, "scripts/cross-space-demo.mjs");

const API = "/api/payfi/v1";
type CrossSpaceDemoTask = {
  taskId: string;
  status: "running" | "success" | "failed";
  stdout: string;
  stderr: string;
  error?: string;
  startedAt: string;
  endedAt?: string;
};
const crossSpaceDemoTasks = new Map<string, CrossSpaceDemoTask>();
const crossSpaceDemoChildren = new Map<string, ReturnType<typeof spawn>>();
let runningCrossSpaceDemoTaskId: string | null = null;

function appendBounded(prev: string, chunk: string): string {
  const next = `${prev}${chunk}`;
  return next.length > 8000 ? next.slice(next.length - 8000) : next;
}

function runCrossSpaceDemoInBackground(task: CrossSpaceDemoTask): void {
  const timeoutMs = Number(process.env.CROSS_SPACE_DEMO_TIMEOUT_MS || "180000");
  const child = spawn("node", [crossSpaceDemoScriptPath], {
    cwd: repoRootDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  crossSpaceDemoChildren.set(task.taskId, child);
  child.stdout.on("data", (buf: Buffer) => {
    task.stdout = appendBounded(task.stdout, buf.toString("utf8"));
  });
  child.stderr.on("data", (buf: Buffer) => {
    task.stderr = appendBounded(task.stderr, buf.toString("utf8"));
  });
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
    task.status = "failed";
    task.error = `cross-space demo timed out after ${timeoutMs}ms`;
    task.endedAt = new Date().toISOString();
    crossSpaceDemoChildren.delete(task.taskId);
    if (runningCrossSpaceDemoTaskId === task.taskId) runningCrossSpaceDemoTaskId = null;
  }, timeoutMs);
  child.on("error", (err) => {
    clearTimeout(timeout);
    task.status = "failed";
    task.error = err instanceof Error ? err.message : String(err);
    task.endedAt = new Date().toISOString();
    crossSpaceDemoChildren.delete(task.taskId);
    if (runningCrossSpaceDemoTaskId === task.taskId) runningCrossSpaceDemoTaskId = null;
  });
  child.on("close", (code) => {
    clearTimeout(timeout);
    crossSpaceDemoChildren.delete(task.taskId);
    if (task.status !== "failed") {
      if (code === 0) {
        task.status = "success";
      } else {
        task.status = "failed";
        task.error = `cross-space demo failed (code ${code ?? "null"})\n${task.stderr || task.stdout}`;
      }
      task.endedAt = new Date().toISOString();
    }
    if (runningCrossSpaceDemoTaskId === task.taskId) runningCrossSpaceDemoTaskId = null;
  });
}

app.get("/health", (_req, res) => {
  const pgOn = isPersistenceEnabled();
  res.json({
    ok: true,
    service: "payfidemo",
    chainId: process.env.CHAIN_ID || "31337",
    /** viem 签交易使用的链 ID；Anvil 应为 31337。若见 1337 说明进程未加载最新代码或未重启。 */
    walletChainId: getWalletChainId(),
    chainMode: isChainMode(),
    chainRpc: process.env.CHAIN_RPC_URL || null,
    escrowConfigured: Boolean(process.env.ESCROW_ADDRESS?.trim()),
    persistence: pgOn ? "postgres" : "memory",
    /** 与 `DATABASE_URL` 协议对应之产品名，仅供展示 */
    databaseProduct: pgOn ? getDatabaseProductLabel() : null,
  });
});

app.use(`${API}/intents`, intentsRouter);
app.use("/webhooks", hashkeyWebhookRouter);
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

/** 仅本地演示：触发 scripts/cross-space-demo.mjs（Core 下单与映射） */
app.post(`${API}/debug/cross-space/demo`, async (_req, res) => {
  if (process.env.PAYFIDEMO_DEBUG !== "true") {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (runningCrossSpaceDemoTaskId) {
    const task = crossSpaceDemoTasks.get(runningCrossSpaceDemoTaskId);
    res.status(409).json({
      error: "cross-space demo is already running",
      taskId: runningCrossSpaceDemoTaskId,
      status: task?.status ?? "running",
    });
    return;
  }
  const taskId = randomUUID();
  const task: CrossSpaceDemoTask = {
    taskId,
    status: "running",
    stdout: "",
    stderr: "",
    startedAt: new Date().toISOString(),
  };
  crossSpaceDemoTasks.set(taskId, task);
  runningCrossSpaceDemoTaskId = taskId;
  runCrossSpaceDemoInBackground(task);
  res.json({ ok: true, taskId, status: task.status, startedAt: task.startedAt });
});

app.get(`${API}/debug/cross-space/demo/:taskId`, async (req, res) => {
  if (process.env.PAYFIDEMO_DEBUG !== "true") {
    res.status(404).json({ error: "not found" });
    return;
  }
  const taskId = req.params.taskId.trim();
  const task = crossSpaceDemoTasks.get(taskId);
  if (!task) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(task);
});

app.post(`${API}/debug/cross-space/demo/:taskId/cancel`, async (req, res) => {
  if (process.env.PAYFIDEMO_DEBUG !== "true") {
    res.status(404).json({ error: "not found" });
    return;
  }
  const taskId = req.params.taskId.trim();
  const task = crossSpaceDemoTasks.get(taskId);
  if (!task) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (task.status !== "running") {
    res.json({ ok: true, taskId, status: task.status, note: "task already finished" });
    return;
  }
  const child = crossSpaceDemoChildren.get(taskId);
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
  task.status = "failed";
  task.error = "cross-space demo cancelled by user";
  task.endedAt = new Date().toISOString();
  crossSpaceDemoChildren.delete(taskId);
  if (runningCrossSpaceDemoTaskId === taskId) runningCrossSpaceDemoTaskId = null;
  res.json({ ok: true, taskId, status: task.status, error: task.error, endedAt: task.endedAt });
});

app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});

const port = Number(process.env.PORT || 8787);
/** Railway / Docker：必须监听 0.0.0.0，否则健康检查可能一直 “service unavailable”。 */
const listenHost = "0.0.0.0";

async function main() {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const s = app.listen(port, listenHost, () => {
      console.log(`payfidemo listening on http://${listenHost}:${port}`);
      console.log(`health: http://127.0.0.1:${port}/health`);
      console.log(`intents: http://127.0.0.1:${port}${API}/intents`);
      resolve(s);
    });
    s.on("error", (err: NodeJS.ErrnoException) => {
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
      reject(err);
    });
  });

  const pool = getPgPool();
  if (pool) {
    console.log("[payfidemo] running Postgres migrations...");
    await runMigrations(pool);
    console.log("[payfidemo] Postgres persistence enabled (DATABASE_URL)");
  }

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
