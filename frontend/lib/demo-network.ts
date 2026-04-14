import { baseSepolia } from "wagmi/chains";

/** HashKey Chain Testnet（黑客松 / 联调常用） */
export const HASHKEY_TESTNET_CHAIN_ID = 133;

export function isPublicUsdcTestnet(chainId: number): boolean {
  return chainId === baseSepolia.id || chainId === HASHKEY_TESTNET_CHAIN_ID;
}

export function chainDisplayName(chainId: number, locale: "zh-CN" | "zh-TW" | "en"): string {
  if (chainId === HASHKEY_TESTNET_CHAIN_ID) {
    return locale === "en" ? "HashKey Chain Testnet" : "HashKey Chain 测试网";
  }
  if (chainId === baseSepolia.id) {
    return locale === "en" ? "Base Sepolia" : "Base Sepolia";
  }
  return locale === "en" ? "Local Anvil" : "本地 Anvil";
}
