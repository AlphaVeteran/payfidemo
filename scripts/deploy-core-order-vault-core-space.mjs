#!/usr/bin/env node
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

  const artifactPath = "out/CoreOrderVault.sol/CoreOrderVault.json";
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const bytecode = artifact?.bytecode?.object
    ? `0x${String(artifact.bytecode.object).replace(/^0x/, "")}`
    : String(artifact?.bytecode ?? "");
  if (!bytecode || bytecode === "0x") throw new Error(`invalid bytecode in ${artifactPath}`);

  const cfx = new Conflux({ url: rpcUrl, networkId });
  const account = cfx.wallet.addPrivateKey(privateKey);

  console.log(`[core-deploy] rpc=${rpcUrl}`);
  console.log(`[core-deploy] networkId=${networkId}`);
  console.log(`[core-deploy] deployer=${account.address}`);

  const balance = await cfx.cfx.getBalance(account.address);
  console.log(`[core-deploy] deployerBalanceDrip=${balance.toString()}`);

  const contract = cfx.Contract({ abi: artifact.abi, bytecode });
  const pendingTx = contract.constructor().sendTransaction({
    from: account.address,
  });
  const txHash = await pendingTx;
  console.log(`[core-deploy] txHash=${txHash}`);

  const receipt = await pendingTx.executed();
  console.log(`[core-deploy] outcomeStatus=${receipt.outcomeStatus}`);
  console.log(`[core-deploy] contractCreated=${receipt.contractCreated}`);
}

main().catch((error) => {
  console.error(`[core-deploy] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
