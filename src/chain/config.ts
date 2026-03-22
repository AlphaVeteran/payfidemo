import { createPublicClient, createWalletClient, http } from "viem";
import { localhost } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export function isChainMode(): boolean {
  return Boolean(
    process.env.CHAIN_RPC_URL?.trim() &&
      process.env.ESCROW_ADDRESS?.trim() &&
      process.env.SUBMITTER_PRIVATE_KEY?.trim(),
  );
}

export function getPublicClient() {
  const url = process.env.CHAIN_RPC_URL!;
  return createPublicClient({
    chain: localhost,
    transport: http(url),
  });
}

export function getSubmitterWallet() {
  const pk = process.env.SUBMITTER_PRIVATE_KEY!.trim() as Hex;
  const url = process.env.CHAIN_RPC_URL!;
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: localhost,
    transport: http(url),
  });
}
