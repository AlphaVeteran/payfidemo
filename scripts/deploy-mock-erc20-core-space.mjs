#!/usr/bin/env node
/**
 * 在 Conflux Core Space 上部署 MockERC20（ERC20，18 decimals，带 mint）。
 *
 * 前置：`forge build`（生成 `out/MockERC20.sol/MockERC20.json`；勿用 `out/mocks/...`，那是 forge-std 的 MockERC20，无 constructor）
 * 环境：与 `deploy-core-order-vault-core-space.mjs` 相同
 *   - CORE_RPC_URL
 *   - CORE_CHAIN_ID（默认 1）
 *   - DEPLOYER_PRIVATE_KEY 或 PRIVATE_KEY
 * 可选：
 *   - MOCK_ERC20_NAME（默认 PayFi Mock Core）
 *   - MOCK_ERC20_SYMBOL（默认 MOCK）
 */
import "dotenv/config";
import fs from "node:fs";
import { Conflux } from "js-conflux-sdk";

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function requireEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const rpcUrl = requireEnv("CORE_RPC_URL");
  const networkId = Number(env("CORE_CHAIN_ID", "1"));
  const rawPk = env("DEPLOYER_PRIVATE_KEY") || requireEnv("PRIVATE_KEY");
  const privateKey = rawPk.startsWith("0x") ? rawPk : `0x${rawPk}`;
  const name = env("MOCK_ERC20_NAME", "PayFi Mock Core");
  const symbol = env("MOCK_ERC20_SYMBOL", "MOCK");

  const artifactPath = "out/MockERC20.sol/MockERC20.json";
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const bytecode = artifact?.bytecode?.object
    ? `0x${String(artifact.bytecode.object).replace(/^0x/, "")}`
    : String(artifact?.bytecode ?? "");
  if (!bytecode || bytecode === "0x") {
    throw new Error(`invalid bytecode in ${artifactPath}; run: forge build`);
  }

  const cfx = new Conflux({ url: rpcUrl, networkId });
  const account = cfx.wallet.addPrivateKey(privateKey);

  console.log(`[core-mock-erc20] rpc=${rpcUrl}`);
  console.log(`[core-mock-erc20] networkId=${networkId}`);
  console.log(`[core-mock-erc20] deployer=${account.address}`);
  console.log(`[core-mock-erc20] name="${name}" symbol="${symbol}"`);

  const balance = await cfx.cfx.getBalance(account.address);
  console.log(`[core-mock-erc20] deployerBalanceDrip=${balance.toString()}`);

  const contract = cfx.Contract({ abi: artifact.abi, bytecode });
  const pendingTx = contract.constructor(name, symbol).sendTransaction({
    from: account.address,
  });
  const txHash = await pendingTx;
  console.log(`[core-mock-erc20] txHash=${txHash}`);

  const receipt = await pendingTx.executed();
  console.log(`[core-mock-erc20] outcomeStatus=${receipt.outcomeStatus}`);
  const created = receipt.contractCreated;
  console.log(`[core-mock-erc20] contractCreated=${created ?? "(see receipt)"}`);
  if (created) {
    console.log(
      `[core-mock-erc20] Set CORE_DEPOSIT_ASSET_ADDRESS and NEXT_PUBLIC_CORE_MOCK_ERC20_ADDRESS to this Core contract address (hex or cfx).`,
    );
  }
}

main().catch((error) => {
  console.error(`[core-mock-erc20] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
