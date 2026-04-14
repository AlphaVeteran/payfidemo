#!/usr/bin/env node
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const coreOrderVaultAbi = parseAbi([
  "event OrderDeposited(uint256 indexed orderId, address indexed buyer, address indexed seller, address asset, uint256 amount, uint256 timestamp, uint256 amountPerLesson, uint256 maxReleases, uint256 durationSeconds, bytes32 agreementHash, address disputeModule)",
]);

const adapterAbi = parseAbi([
  "function createEscrowFromCore(uint256 coreOrderId, address buyer, address seller, address asset, uint128 amountTotal, uint128 amountPerLesson, uint16 maxReleases, uint64 expiresAt, bytes32 agreementHash, address disputeModule) returns (uint256 escrowId)",
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

function parsePk(raw) {
  if (!raw) throw new Error("RELAYER_PRIVATE_KEY is required");
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

async function main() {
  const coreChainId = Number(env("CORE_CHAIN_ID", "71"));
  const eSpaceChainId = Number(env("ESPACE_CHAIN_ID", "71"));
  const pollMs = Number(env("RELAYER_POLL_MS", "7000"));
  const confirmations = BigInt(env("RELAYER_CONFIRMATIONS", "1"));

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

  const coreVaultAddress = getAddress(env("CORE_ORDER_VAULT_ADDRESS"));
  const adapterAddress = getAddress(env("ESPACE_ADAPTER_ADDRESS"));

  const account = privateKeyToAccount(parsePk(env("RELAYER_PRIVATE_KEY")));
  const coreClient = createPublicClient({ chain: coreChain, transport: http(coreChain.rpcUrls.default.http[0]) });
  const eSpaceClient = createPublicClient({ chain: eSpaceChain, transport: http(eSpaceChain.rpcUrls.default.http[0]) });
  const eSpaceWallet = createWalletClient({
    chain: eSpaceChain,
    account,
    transport: http(eSpaceChain.rpcUrls.default.http[0]),
  });

  let fromBlock = BigInt(env("RELAYER_FROM_BLOCK", "0")) || (await coreClient.getBlockNumber());
  console.log(`[relayer] started at core block ${fromBlock.toString()}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const latest = await coreClient.getBlockNumber();
    if (latest <= fromBlock) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }

    const toBlock = latest - confirmations;
    if (toBlock <= fromBlock) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }

    const logs = await coreClient.getLogs({
      address: coreVaultAddress,
      event: coreOrderVaultAbi[0],
      fromBlock: fromBlock + 1n,
      toBlock,
    });

    for (const log of logs) {
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
      } = log.args;
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
      try {
        const txHash = await eSpaceWallet.writeContract({
          address: adapterAddress,
          abi: adapterAbi,
          functionName: "createEscrowFromCore",
          args: [
            orderId,
            buyer,
            seller,
            asset,
            amount,
            amountPerLesson,
            Number(maxReleases),
            expiresAt,
            agreementHash,
            getAddress(disputeModule),
          ],
        });
        console.log(`[relayer] mapped coreOrder=${orderId.toString()} tx=${txHash}`);
        await eSpaceClient.waitForTransactionReceipt({ hash: txHash });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[relayer] failed order=${orderId.toString()} err=${message}`);
      }
    }

    fromBlock = toBlock;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

