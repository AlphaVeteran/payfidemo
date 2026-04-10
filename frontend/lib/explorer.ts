import { baseSepolia } from "wagmi/chains";
import { HASHKEY_TESTNET_CHAIN_ID } from "@/lib/demo-network";

function explorerBase(chainId: number): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (chainId === HASHKEY_TESTNET_CHAIN_ID) return "https://hashkey.blockscout.com";
  if (chainId === baseSepolia.id) return "https://sepolia.basescan.org";
  return null;
}

export function blockExplorerTxUrl(chainId: number, txHash: string): string | null {
  const base = explorerBase(chainId);
  if (!base || !/^0x[a-fA-F0-9]+$/.test(txHash)) return null;
  return `${base}/tx/${txHash}`;
}

export function blockExplorerAddressUrl(chainId: number, address: string): string | null {
  const base = explorerBase(chainId);
  if (!base || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  return `${base}/address/${address}`;
}
