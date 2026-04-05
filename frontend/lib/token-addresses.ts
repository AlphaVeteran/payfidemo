import { baseSepolia } from "wagmi/chains";

/** Circle 官方 Base Sepolia 测试 USDC（6 decimals）。见 https://developers.circle.com/stablecoins/usdc-contract-addresses */
export const BASE_SEPOLIA_USDC_ADDRESS =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const BASE_SEPOLIA_USDC_DECIMALS = 6 as const;

/**
 * 本地 Anvil `LocalAnvilBootstrap` 首次部署的 MockERC20 确定性地址（chainId 31337）。
 * 仅用于本地链；Base Sepolia 上请使用 {@link BASE_SEPOLIA_USDC_ADDRESS}。
 */
export const ANVIL_DEFAULT_MOCK_ERC20_ADDRESS =
  "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

export function defaultDemoAssetAddress(chainId: number): `0x${string}` {
  return chainId === baseSepolia.id
    ? BASE_SEPOLIA_USDC_ADDRESS
    : ANVIL_DEFAULT_MOCK_ERC20_ADDRESS;
}
