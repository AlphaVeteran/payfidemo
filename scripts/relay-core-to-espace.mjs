#!/usr/bin/env node
import "dotenv/config";
import { createServer } from "node:http";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbi,
  parseAbiItem,
  defineChain,
} from "viem";
import { format as cfxFormat } from "js-conflux-sdk";
import { privateKeyToAccount } from "viem/accounts";

const coreOrderVaultAbi = parseAbi([
  "event OrderDeposited(uint256 indexed orderId, address indexed buyer, address indexed seller, address asset, uint256 amount, uint256 timestamp, uint256 amountPerLesson, uint256 maxReleases, uint256 durationSeconds, bytes32 agreementHash, address disputeModule)",
]);

const adapterAbi = parseAbi([
  "function createEscrowFromCore(uint256 coreOrderId, address buyer, address seller, address asset, uint128 amountTotal, uint128 amountPerLesson, uint16 maxReleases, uint64 expiresAt, bytes32 agreementHash, address disputeModule) returns (uint256 escrowId)",
]);
const coreOrderMappedEvent = parseAbiItem(
  "event CoreOrderMapped(uint256 indexed coreOrderId, uint256 indexed escrowId)",
);

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function envAny(names, fallback = "") {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return fallback;
}

function parsePk(raw) {
  if (!raw) throw new Error("RELAYER_PRIVATE_KEY is required");
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

async function notifyMapping({ apiBase, coreOrderId, escrowId, mappedTxHash }) {
  if (!apiBase) return;
  const url = `${apiBase.replace(/\/$/, "")}/api/payfi/v1/intents/core-links/mapped`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ coreOrderId, escrowId, mappedTxHash }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`mapping callback failed status=${res.status} body=${txt}`);
  }
}

async function coreRpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`core rpc ${method} failed status=${res.status} body=${txt}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`core rpc ${method} error=${json.error.message ?? JSON.stringify(json.error)}`);
  }
  return json.result;
}

function toEpochHex(value) {
  return `0x${value.toString(16)}`;
}

/** Railway 等 PaaS 会探测 HTTP；Relayer 无 Web 框架，仅在设置了 PORT 时挂一个 /health。本地不设 PORT 则不监听。 */
function listenRailwayHealthServer() {
  const raw = process.env.PORT?.trim();
  if (!raw) return Promise.resolve();
  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/health" || pathname === "/") {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, service: "payfidemo-relayer" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.on("error", reject);
    server.listen(port, "0.0.0.0", () => {
      console.log(`[relayer] health http://0.0.0.0:${port}/health`);
      resolve();
    });
  });
}

async function main() {
  await listenRailwayHealthServer();

  if (!envAny(["CORE_RPC_URL", "CORESPACE_RPC_URL"])) {
    throw new Error("CORE_RPC_URL (or CORESPACE_RPC_URL) is required");
  }
  if (!env("ESPACE_RPC_URL")) {
    throw new Error("ESPACE_RPC_URL is required");
  }

  /** Conflux Core Testnet 为 1（勿与 eSpace 71 混淆）；未设置时默认 1。 */
  const coreChainId = Number(env("CORE_CHAIN_ID", "1"));
  const eSpaceChainId = Number(env("ESPACE_CHAIN_ID", "71"));
  const pollMs = Number(env("RELAYER_POLL_MS", "7000"));
  const confirmations = BigInt(env("RELAYER_CONFIRMATIONS", "1"));
  const baseConfirmations = confirmations > 1n ? confirmations : 2n;
  let adaptiveConfirmations = baseConfirmations;
  const apiBase = env("PAYFI_API_URL", "http://127.0.0.1:8787");
  const eSpaceDepositAssetOverride = env("ESPACE_DEPOSIT_ASSET_ADDRESS");

  const coreChain = defineChain({
    id: coreChainId,
    name: "conflux-core",
    nativeCurrency: { name: "CFX", symbol: "CFX", decimals: 18 },
    rpcUrls: {
      default: {
        http: [envAny(["CORE_RPC_URL", "CORESPACE_RPC_URL"])],
      },
    },
  });
  const eSpaceChain = defineChain({
    id: eSpaceChainId,
    name: "conflux-espace",
    nativeCurrency: { name: "CFX", symbol: "CFX", decimals: 18 },
    rpcUrls: { default: { http: [env("ESPACE_RPC_URL")] } },
  });

  const coreVaultAddressRaw = envAny(["CORE_ORDER_VAULT_CFX_ADDRESS", "CORE_ORDER_VAULT_ADDRESS"]);
  if (!coreVaultAddressRaw) {
    throw new Error("CORE_ORDER_VAULT_CFX_ADDRESS or CORE_ORDER_VAULT_ADDRESS is required");
  }
  const coreVaultAddress =
    coreVaultAddressRaw.startsWith("cfx") || coreVaultAddressRaw.startsWith("CFX")
      ? coreVaultAddressRaw
      : getAddress(coreVaultAddressRaw);
  const adapterAddress = getAddress(env("ESPACE_ADAPTER_ADDRESS"));

  const account = privateKeyToAccount(parsePk(env("RELAYER_PRIVATE_KEY")));
  const coreRpcUrl = coreChain.rpcUrls.default.http[0];
  const eSpaceClient = createPublicClient({ chain: eSpaceChain, transport: http(eSpaceChain.rpcUrls.default.http[0]) });
  const eSpaceWallet = createWalletClient({
    chain: eSpaceChain,
    account,
    transport: http(eSpaceChain.rpcUrls.default.http[0]),
  });

  let fromBlock = BigInt(env("RELAYER_FROM_BLOCK", "0"));
  if (fromBlock === 0n) {
    const latestEpochHex = await coreRpc(coreRpcUrl, "cfx_epochNumber", ["latest_mined"]);
    const latest = BigInt(latestEpochHex);
    // Cold-start guard: start one epoch behind to avoid missing logs
    // produced around relayer startup time.
    fromBlock = latest > 0n ? latest - 1n : 0n;
  }
  console.log(`[relayer] started at core block ${fromBlock.toString()}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const latest = BigInt(await coreRpc(coreRpcUrl, "cfx_epochNumber", ["latest_mined"]));
    if (latest <= fromBlock) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }

    // Core public RPC can have brief tip skew across backend nodes.
    // Use adaptive lag: expand on epoch-window errors, then decay gradually.
    const effectiveConfirmations = adaptiveConfirmations > 1n ? adaptiveConfirmations : 2n;
    const toBlock = latest - effectiveConfirmations;
    if (toBlock < fromBlock + 1n) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }

    const queryFrom = fromBlock + 1n;
    const queryTo = toBlock;
    if (queryFrom > queryTo) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }

    // 仅使用本轮回「第一次」latest 构造窗口（见上文）。
    const effectiveTo = queryTo;

    if (queryFrom > effectiveTo) {
      console.warn(
        `[relayer] skip: would call cfx_getLogs with fromEpoch>toEpoch queryFrom=${queryFrom.toString()} effectiveTo=${effectiveTo.toString()} fromBlock=${fromBlock.toString()} latest=${latest.toString()} lag=${effectiveConfirmations.toString()}`,
      );
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }

    const coreVaultFilterAddress =
      coreVaultAddress.startsWith("cfx") || coreVaultAddress.startsWith("CFX")
        ? coreVaultAddress
        : cfxFormat.address(coreVaultAddress, coreChainId);
    let rawLogs = [];
    try {
      rawLogs = await coreRpc(coreRpcUrl, "cfx_getLogs", [
        {
          address: coreVaultFilterAddress,
          fromEpoch: toEpochHex(queryFrom),
          toEpoch: toEpochHex(effectiveTo),
          topics: [coreOrderVaultAbi[0].topic],
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        /Filter has wrong epoch numbers set/i.test(message) ||
        /Invalid params: expected a numbers with less than largest epoch number/i.test(message) ||
        /Invalid params.*largest epoch number/i.test(message)
      ) {
        if (adaptiveConfirmations < 20n) adaptiveConfirmations += 1n;
        const m = message.match(/\(from:\s*(\d+),\s*to:\s*(\d+)\)/i);
        if (m?.[1] && m?.[2]) {
          const fromErr = BigInt(m[1]);
          const toErr = BigInt(m[2]);
          // 仅当 RPC 报告的区间方向正常时，才用 floor 回退 fromBlock；from>to 时乱改会加剧抖动。
          if (fromErr <= toErr) {
            const floor = fromErr;
            fromBlock = floor > 0n ? floor - 1n : 0n;
          }
        }
        try {
          const latestNowHex = await coreRpc(coreRpcUrl, "cfx_epochNumber", ["latest_mined"]);
          const latestNow = BigInt(latestNowHex);
          // Self-heal on backend tip skew (multi-RPC backend can return regressed epochs).
          // Re-anchor scanner to latest-1 to avoid repeated invalid [from,to] windows.
          const anchored = latestNow > 0n ? latestNow - 1n : 0n;
          if (anchored < fromBlock) {
            fromBlock = anchored;
          }
        } catch {
          // ignore refresh failure; keep retry loop alive
        }
        console.warn(`[relayer] transient epoch-range error, retrying: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        continue;
      }
      if (/request rate exceeded|Too many requests/i.test(message)) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(pollMs, 1500)));
        continue;
      }
      throw error;
    }
    if (rawLogs.length > 0) {
      console.log(
        `[relayer] scan epochs ${queryFrom.toString()}..${queryTo.toString()} logs=${rawLogs.length}`,
      );
    }
    if (adaptiveConfirmations > baseConfirmations) adaptiveConfirmations -= 1n;

    for (const rawLog of rawLogs) {
      let args;
      try {
        args = decodeEventLog({
          abi: coreOrderVaultAbi,
          eventName: "OrderDeposited",
          data: rawLog.data,
          topics: rawLog.topics,
        }).args;
      } catch {
        continue;
      }
      const {
        orderId,
        buyer,
        seller,
        asset,
        amount,
        timestamp,
        amountPerLesson,
        maxReleases,
        durationSeconds,
        agreementHash,
        disputeModule,
      } = args;
      if (
        orderId === undefined ||
        buyer === undefined ||
        seller === undefined ||
        asset === undefined ||
        amount === undefined ||
        timestamp === undefined ||
        amountPerLesson === undefined ||
        maxReleases === undefined ||
        durationSeconds === undefined ||
        agreementHash === undefined ||
        disputeModule === undefined
      ) {
        continue;
      }

      const expiresAt = timestamp + durationSeconds;
      const mappedAsset = eSpaceDepositAssetOverride
        ? getAddress(eSpaceDepositAssetOverride)
        : getAddress(asset);
      try {
        const txHash = await eSpaceWallet.writeContract({
          address: adapterAddress,
          abi: adapterAbi,
          functionName: "createEscrowFromCore",
          args: [
            orderId,
            buyer,
            seller,
            mappedAsset,
            amount,
            amountPerLesson,
            Number(maxReleases),
            expiresAt,
            agreementHash,
            getAddress(disputeModule),
          ],
        });
        console.log(`[relayer] mapped coreOrder=${orderId.toString()} tx=${txHash}`);
        const receipt = await eSpaceClient.waitForTransactionReceipt({ hash: txHash });
        let escrowId;
        try {
          const logs = await eSpaceClient.getLogs({
            address: adapterAddress,
            event: coreOrderMappedEvent,
            fromBlock: receipt.blockNumber,
            toBlock: receipt.blockNumber,
            args: { coreOrderId: orderId },
          });
          escrowId = logs[0]?.args?.escrowId?.toString();
        } catch {
          // best effort: callback can still include just tx hash
        }
        if (escrowId) {
          await notifyMapping({
            apiBase,
            coreOrderId: orderId.toString(),
            escrowId,
            mappedTxHash: txHash,
          });
          console.log(`[relayer] linked coreOrder=${orderId.toString()} escrowId=${escrowId}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[relayer] failed order=${orderId.toString()} epochs=${queryFrom.toString()}..${queryTo.toString()} err=${message}`,
        );
      }
    }

    fromBlock = effectiveTo;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

