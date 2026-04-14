#!/usr/bin/env node
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

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

  const buyer = privateKeyToAccount(pk("BUYER_PRIVATE_KEY"));
  const coreClient = createPublicClient({ chain: coreChain, transport: http(coreChain.rpcUrls.default.http[0]) });
  const eSpaceClient = createPublicClient({
    chain: eSpaceChain,
    transport: http(eSpaceChain.rpcUrls.default.http[0]),
  });
  const buyerWallet = createWalletClient({
    account: buyer,
    chain: coreChain,
    transport: http(coreChain.rpcUrls.default.http[0]),
  });

  const coreVaultAddress = getAddress(env("CORE_ORDER_VAULT_ADDRESS"));
  const coreAssetAddress = getAddress(env("CORE_DEPOSIT_ASSET_ADDRESS"));
  const sellerAddress = getAddress(env("SELLER_ADDRESS"));
  const adapterAddress = getAddress(env("ESPACE_ADAPTER_ADDRESS"));

  const orderId = BigInt(env("DEMO_ORDER_ID", Date.now().toString()));
  const amountTotal = BigInt(env("DEMO_AMOUNT_TOTAL", "1000000"));
  const amountPerLesson = BigInt(env("DEMO_AMOUNT_PER_LESSON", "100000"));
  const maxReleases = Number(env("DEMO_MAX_RELEASES", "10"));
  const durationSeconds = Number(env("DEMO_DURATION_SECONDS", "2592000"));
  const agreementHash = env(
    "DEMO_AGREEMENT_HASH",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  );
  const disputeModule = getAddress(env("DEMO_DISPUTE_MODULE", "0x0000000000000000000000000000000000000000"));

  const allowance = await coreClient.readContract({
    address: coreAssetAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [buyer.address, coreVaultAddress],
  });
  if (allowance < amountTotal) {
    const approveHash = await buyerWallet.writeContract({
      address: coreAssetAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [coreVaultAddress, amountTotal],
    });
    await coreClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`[demo] approved core vault tx=${approveHash}`);
  }

  const fromBlock = await eSpaceClient.getBlockNumber();
  const placeHash = await buyerWallet.writeContract({
    address: coreVaultAddress,
    abi: coreVaultAbi,
    functionName: "placeOrderDeposit",
    args: [
      orderId,
      sellerAddress,
      coreAssetAddress,
      amountTotal,
      amountPerLesson,
      maxReleases,
      durationSeconds,
      agreementHash,
      disputeModule,
    ],
  });
  await coreClient.waitForTransactionReceipt({ hash: placeHash });
  console.log(`[demo] core order placed orderId=${orderId.toString()} tx=${placeHash}`);

  const maxWaitMs = Number(env("DEMO_WAIT_MS", "120000"));
  const pollMs = Number(env("DEMO_POLL_MS", "5000"));
  const deadline = Date.now() + maxWaitMs;

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
    await sleep(pollMs);
  }

  throw new Error("timeout waiting CoreOrderMapped event; check relayer is running");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

