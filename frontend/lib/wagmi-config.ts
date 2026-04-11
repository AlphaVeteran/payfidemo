import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { HASHKEY_TESTNET_CHAIN_ID } from "@/lib/demo-network";

const DEFAULT_ANVIL_CHAIN_ID = 31337;

const anvilChainId = Number(
  process.env.NEXT_PUBLIC_ANVIL_CHAIN_ID ?? DEFAULT_ANVIL_CHAIN_ID,
);
const anvilRpc =
  typeof process.env.NEXT_PUBLIC_ANVIL_RPC_URL === "string" &&
  process.env.NEXT_PUBLIC_ANVIL_RPC_URL.length > 0
    ? process.env.NEXT_PUBLIC_ANVIL_RPC_URL
    : "http://127.0.0.1:8545";

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
const enableHashKeyTestnet = targetId === HASHKEY_TESTNET_CHAIN_ID;

const hashKeyExplorerBase =
  typeof process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL === "string" &&
  process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL.length > 0
    ? process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL.replace(/\/$/, "")
    : "https://testnet-explorer.hsk.xyz";

const hashKeyTestnet = defineChain({
  id: HASHKEY_TESTNET_CHAIN_ID,
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: {
    default: { http: [targetChainRpc ?? "https://testnet.hsk.xyz"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: hashKeyExplorerBase },
  },
});

const chains = enableBaseSepolia
  ? ([anvilChain, baseSepolia] as const)
  : enableHashKeyTestnet
    ? ([hashKeyTestnet] as const)
    : ([anvilChain] as const);

const transports: Record<number, ReturnType<typeof http>> = {};

if (enableBaseSepolia) {
  transports[anvilChain.id] = http(anvilRpc);
  transports[baseSepolia.id] = http(
    targetChainRpc ? targetChainRpc : baseRpc,
  );
} else if (enableHashKeyTestnet) {
  transports[hashKeyTestnet.id] = http(targetChainRpc ?? "https://testnet.hsk.xyz");
} else {
  transports[anvilChain.id] = http(anvilRpc);
}

export const wagmiConfig = createConfig({
  chains,
  transports,
  ssr: false,
});

export const targetChain = enableBaseSepolia
  ? baseSepolia
  : enableHashKeyTestnet
    ? hashKeyTestnet
    : anvilChain;

export const targetChainId = targetChain.id;
