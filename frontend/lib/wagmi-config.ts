import { createConfig, http, injected } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { defineChain } from "viem";

const DEFAULT_ANVIL_CHAIN_ID = 31337;

const anvilChainId = Number(
  process.env.NEXT_PUBLIC_ANVIL_CHAIN_ID ?? DEFAULT_ANVIL_CHAIN_ID,
);
const anvilRpc =
  typeof process.env.NEXT_PUBLIC_ANVIL_RPC_URL === "string" &&
  process.env.NEXT_PUBLIC_ANVIL_RPC_URL.length > 0
    ? process.env.NEXT_PUBLIC_ANVIL_RPC_URL
    : "http://127.0.0.1:8545";

// Target chain: default is local Anvil, optional config via NEXT_PUBLIC_CHAIN_ID/ NEXT_PUBLIC_CHAIN_RPC_URL
const targetId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? anvilChainId);
const targetChainRpc =
  typeof process.env.NEXT_PUBLIC_CHAIN_RPC_URL === "string" &&
  process.env.NEXT_PUBLIC_CHAIN_RPC_URL.length > 0
    ? process.env.NEXT_PUBLIC_CHAIN_RPC_URL
    : null;

const anvilChain = defineChain({
  id: anvilChainId,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [anvilRpc] } },
});

const baseRpc =
  typeof process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL === "string" &&
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL.length > 0
    ? process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL
    : "https://sepolia.base.org";

const enableBaseSepolia = targetId === baseSepolia.id;

const chains = enableBaseSepolia
  ? ([anvilChain, baseSepolia] as const)
  : ([anvilChain] as const);

const transports: Record<number, ReturnType<typeof http>> = {
  [anvilChain.id]: http(anvilRpc),
};

if (enableBaseSepolia) {
  transports[baseSepolia.id] = http(
    // If user explicitly sets target rpc, prefer it.
    targetChainRpc ? targetChainRpc : baseRpc,
  );
}

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  transports,
  ssr: false,
});

export const targetChain = enableBaseSepolia ? baseSepolia : anvilChain;

export const targetChainId = targetChain.id;
