#!/usr/bin/env node
import "dotenv/config";
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { Conflux } from "js-conflux-sdk";

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const coreVaultAbi = parseAbi([
  "function placeOrderDeposit(uint256 orderId, address seller, address asset, uint128 amount, uint128 amountPerLesson, uint16 maxReleases, uint64 durationSeconds, bytes32 agreementHash, address disputeModule)",
]);

const adapterAbi = parseAbi([
  "event CoreOrderMapped(uint256 indexed coreOrderId, uint256 indexed escrowId)",
]);

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

async function fetchCoreLinkByOrder(apiBase, orderId) {
  if (!apiBase) return null;
  const base = apiBase.replace(/\/$/, "");
  const url = `${base}/api/payfi/v1/intents/core-links/by-core-order/${encodeURIComponent(orderId)}`;
  try {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    const link = data?.link;
    if (!link || typeof link.escrowId !== "string") return null;
    return link;
  } catch {
    return null;
  }
}

function pk(name) {
  const raw = env(name);
  if (!raw) throw new Error(`${name} is required`);
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const coreChain = defineChain({
    id: Number(env("CORE_CHAIN_ID", "71")),
    name: "conflux-core",
    nativeCurrency: { name: "CFX", symbol: "CFX", decimals: 18 },
    rpcUrls: {
      default: {
        http: [envAny(["CORE_RPC_URL", "CORESPACE_RPC_URL"])],
      },
    },
  });
  const eSpaceChain = defineChain({
    id: Number(env("ESPACE_CHAIN_ID", "71")),
    name: "conflux-espace",
    nativeCurrency: { name: "CFX", symbol: "CFX", decimals: 18 },
    rpcUrls: { default: { http: [env("ESPACE_RPC_URL")] } },
  });

  const coreRpcUrl = coreChain.rpcUrls.default.http[0];
  const coreClient = new Conflux({ url: coreRpcUrl, networkId: coreChain.id });
  const coreBuyer = coreClient.wallet.addPrivateKey(pk("BUYER_PRIVATE_KEY"));
  const eSpaceClient = createPublicClient({
    chain: eSpaceChain,
    transport: http(eSpaceChain.rpcUrls.default.http[0]),
  });

  const coreVaultAddressRaw = envAny(["CORE_ORDER_VAULT_CFX_ADDRESS", "CORE_ORDER_VAULT_ADDRESS"]);
  if (!coreVaultAddressRaw) {
    throw new Error("CORE_ORDER_VAULT_CFX_ADDRESS or CORE_ORDER_VAULT_ADDRESS is required");
  }
  const coreVaultAddress =
    coreVaultAddressRaw.startsWith("cfx") || coreVaultAddressRaw.startsWith("CFX")
      ? coreVaultAddressRaw
      : getAddress(coreVaultAddressRaw);
  const coreAssetAddressRaw = env("CORE_DEPOSIT_ASSET_ADDRESS");
  if (!coreAssetAddressRaw) {
    throw new Error("CORE_DEPOSIT_ASSET_ADDRESS is required");
  }
  const coreAssetAddress =
    coreAssetAddressRaw.startsWith("cfx") || coreAssetAddressRaw.startsWith("CFX")
      ? coreAssetAddressRaw
      : getAddress(coreAssetAddressRaw);
  const sellerAddress = getAddress(env("SELLER_ADDRESS"));
  const adapterAddress = getAddress(env("ESPACE_ADAPTER_ADDRESS"));
  const apiBase = env("PAYFI_API_URL", "http://127.0.0.1:8787");

  const orderIdRaw = env("DEMO_ORDER_ID");
  const orderId = BigInt(orderIdRaw || Date.now().toString());
  const amountTotal = BigInt(env("DEMO_AMOUNT_TOTAL", "1000000"));
  const amountPerLesson = BigInt(env("DEMO_AMOUNT_PER_LESSON", "100000"));
  const maxReleases = Number(env("DEMO_MAX_RELEASES", "10"));
  const durationSeconds = Number(env("DEMO_DURATION_SECONDS", "2592000"));
  const agreementHash = env(
    "DEMO_AGREEMENT_HASH",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  );
  const disputeModule = getAddress(env("DEMO_DISPUTE_MODULE", "0x0000000000000000000000000000000000000000"));

  const allowance = await coreClient
    .Contract({
      address: coreAssetAddress.toLowerCase(),
      abi: erc20Abi,
    })
    .allowance(coreBuyer.address, coreVaultAddress)
    .call();
  const allowanceValue = BigInt(allowance.toString());
  if (allowanceValue < amountTotal) {
    const approveTx = await coreClient
      .Contract({
        address: coreAssetAddress.toLowerCase(),
        abi: erc20Abi,
      })
      .approve(coreVaultAddress, amountTotal)
      .sendTransaction({ from: coreBuyer.address });
    let approveReceipt = null;
    while (!approveReceipt) {
      approveReceipt = await coreClient.cfx.getTransactionReceipt(approveTx);
      if (!approveReceipt) await sleep(1500);
    }
    if (approveReceipt.outcomeStatus !== 0) {
      throw new Error(`approve failed outcomeStatus=${approveReceipt.outcomeStatus}`);
    }
    console.log(`[demo] approved core vault tx=${approveTx}`);
  }

  const fromBlock = await eSpaceClient.getBlockNumber();
  const placeTx = await coreClient
    .Contract({
      address: coreVaultAddress.toLowerCase(),
      abi: coreVaultAbi,
    })
    .placeOrderDeposit(
      orderId,
      sellerAddress,
      coreAssetAddress,
      amountTotal,
      amountPerLesson,
      maxReleases,
      durationSeconds,
      agreementHash,
      disputeModule,
    )
    .sendTransaction({ from: coreBuyer.address });
  let placeReceipt = null;
  while (!placeReceipt) {
    placeReceipt = await coreClient.cfx.getTransactionReceipt(placeTx);
    if (!placeReceipt) await sleep(1500);
  }
  if (placeReceipt.outcomeStatus !== 0) {
    throw new Error(`placeOrderDeposit failed outcomeStatus=${placeReceipt.outcomeStatus}`);
  }
  console.log(`[demo] core order placed orderId=${orderId.toString()} tx=${placeTx}`);

  const maxWaitMs = Number(env("DEMO_WAIT_MS", "120000"));
  const pollMs = Number(env("DEMO_POLL_MS", "5000"));
  const deadline = Date.now() + maxWaitMs;
  let lastApiLinked = null;

  while (Date.now() < deadline) {
    const logs = await eSpaceClient.getLogs({
      address: adapterAddress,
      event: adapterAbi[0],
      fromBlock,
      toBlock: "latest",
      args: { coreOrderId: orderId },
    });
    if (logs.length > 0) {
      const latest = logs[logs.length - 1];
      console.log(
        `[demo] mapped to escrowId=${latest.args.escrowId?.toString() ?? "unknown"} tx=${latest.transactionHash}`,
      );
      return;
    }
    const linked = await fetchCoreLinkByOrder(apiBase, orderId.toString());
    if (linked?.escrowId) {
      lastApiLinked = linked;
      console.log(
        `[demo] mapped via API coreOrder=${orderId.toString()} escrowId=${linked.escrowId} tx=${linked.mappedTxHash ?? "unknown"}`,
      );
      return;
    }
    await sleep(pollMs);
  }

  const linkedAfterTimeout = await fetchCoreLinkByOrder(apiBase, orderId.toString());
  const finalLink = linkedAfterTimeout ?? lastApiLinked;
  if (finalLink?.escrowId) {
    console.log(
      `[demo] mapped via API after timeout window coreOrder=${orderId.toString()} escrowId=${finalLink.escrowId} tx=${finalLink.mappedTxHash ?? "unknown"}`,
    );
    return;
  }
  throw new Error(
    [
      "timeout waiting CoreOrderMapped event",
      `orderId=${orderId.toString()}`,
      `waitMs=${maxWaitMs}`,
      `pollMs=${pollMs}`,
      `apiBase=${apiBase || "unset"}`,
      "check relayer logs for scan epochs and mapped/linked lines",
    ].join(" | "),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

