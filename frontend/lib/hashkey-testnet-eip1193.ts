import { HASHKEY_TESTNET_CHAIN_ID } from "@/lib/demo-network";

/** MetaMask `wallet_addEthereumChain` 参数（链 ID 为 133 = 0x85） */
export const HASHKEY_TESTNET_CHAIN_ID_HEX = `0x${HASHKEY_TESTNET_CHAIN_ID.toString(16)}` as const;

export type MinimalEip1193Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
};

/** 使用官方测试网 RPC；与 wagmi `hashKeyTestnet` 一致 */
export function hashKeyTestnetAddEthereumChainParams(rpcUrl: string, explorerUrl: string) {
  return {
    chainId: HASHKEY_TESTNET_CHAIN_ID_HEX,
    chainName: "HashKey Chain Testnet",
    nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
    rpcUrls: [rpcUrl],
    blockExplorerUrls: [explorerUrl.replace(/\/$/, "")],
  };
}

/**
 * 先切链；若链未添加（4902），再 wallet_addEthereumChain 并重试切换。
 * 见 MetaMask 文档：switch → 4902 → add → switch。
 */
export async function ensureHashKeyTestnetInWallet(
  provider: MinimalEip1193Provider,
  options?: { rpcUrl?: string; explorerUrl?: string },
): Promise<void> {
  const rpcUrl = options?.rpcUrl?.trim() || "https://testnet.hsk.xyz";
  const explorerUrl = options?.explorerUrl?.trim() || "https://testnet-explorer.hsk.xyz";
  const addParams = hashKeyTestnetAddEthereumChainParams(rpcUrl, explorerUrl);

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HASHKEY_TESTNET_CHAIN_ID_HEX }],
    });
    return;
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code?: number }).code : undefined;
    if (code === 4001) throw e;
    // EIP-3085: chain not added
    if (code !== 4902) throw e;
  }

  await provider.request({
    method: "wallet_addEthereumChain",
    params: [addParams],
  });

  await provider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: HASHKEY_TESTNET_CHAIN_ID_HEX }],
  });
}
