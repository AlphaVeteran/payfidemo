import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import type { Chain } from "viem";
import { foundry as foundryChain } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

/** 与 EIP-712 `release/prepare` 及 Anvil 默认链一致（勿用 viem 的 `localhost`，id=1337）。 */
export function parseChainIdFromEnv(): number {
  const raw = String(process.env.CHAIN_ID ?? "31337").trim();
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : 31_337;
}

/** 与 `chainFromEnv().id` 一致，供 /health 等展示（不依赖 RPC URL 是否已填）。 */
export function getWalletChainId(): number {
  return parseChainIdFromEnv();
}

function chainFromEnv(): Chain {
  const url = process.env.CHAIN_RPC_URL!;
  const id = parseChainIdFromEnv();
  if (id === foundryChain.id) {
    return {
      ...foundryChain,
      rpcUrls: { default: { http: [url] } },
    };
  }
  return defineChain({
    id,
    name: "payfidemo",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
}

export function isChainMode(): boolean {
  return Boolean(
    process.env.CHAIN_RPC_URL?.trim() &&
      process.env.ESCROW_ADDRESS?.trim() &&
      process.env.SUBMITTER_PRIVATE_KEY?.trim(),
  );
}

export function getPublicClient() {
  const url = process.env.CHAIN_RPC_URL!;
  const chain = chainFromEnv();
  return createPublicClient({
    chain,
    transport: http(url),
  });
}

export function getSubmitterWallet() {
  const pk = process.env.SUBMITTER_PRIVATE_KEY!.trim() as Hex;
  const url = process.env.CHAIN_RPC_URL!;
  const chain = chainFromEnv();
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain,
    transport: http(url),
  });
}
