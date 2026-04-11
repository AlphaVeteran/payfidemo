import { baseSepolia } from "wagmi/chains";
import { HASHKEY_TESTNET_CHAIN_ID } from "@/lib/demo-network";

/** Circle 官方 Base Sepolia 测试 USDC（6 decimals）。见 https://developers.circle.com/stablecoins/usdc-contract-addresses */
export const BASE_SEPOLIA_USDC_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const BASE_SEPOLIA_USDC_DECIMALS = 6 as const;

/** 与 `.env.example` 对齐；可被 `NEXT_PUBLIC_USDC_CONTRACT` 覆盖 */
export const HASHKEY_TESTNET_USDC_DEFAULT =
  "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6" as const;

/**
 * 本地 Anvil `LocalAnvilBootstrap` 首次部署的 MockERC20 确定性地址（chainId 31337）。
 * 仅用于本地链；公网测试网请使用对应 USDC 地址。
 */
export const ANVIL_DEFAULT_MOCK_ERC20_ADDRESS =
  "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

export function defaultDemoAssetAddress(chainId: number): `0x${string}` {
  if (chainId === baseSepolia.id) {
    return BASE_SEPOLIA_USDC_ADDRESS;
  }
  if (chainId === HASHKEY_TESTNET_CHAIN_ID) {
    const fromEnv = process.env.NEXT_PUBLIC_USDC_CONTRACT?.trim();
    if (fromEnv && /^0x[a-fA-F0-9]{40}$/i.test(fromEnv)) {
      return fromEnv as `0x${string}`;
    }
    return HASHKEY_TESTNET_USDC_DEFAULT;
  }
  return ANVIL_DEFAULT_MOCK_ERC20_ADDRESS;
}

/** 新建意向表单用的 USDC 小数位：Base Sepolia / HashKey 测试网为 6；Anvil Mock 为 18 */
export function demoUsdcDecimals(chainId: number): number {
  if (chainId === baseSepolia.id || chainId === HASHKEY_TESTNET_CHAIN_ID) {
    return BASE_SEPOLIA_USDC_DECIMALS;
  }
  return 18;
}
