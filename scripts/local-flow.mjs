#!/usr/bin/env node
import "dotenv/config";
import { erc20Abi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";

const escrowAbi = [
  {
    type: "function",
    name: "createAndDeposit",
    inputs: [
      { name: "merchant_", type: "address" },
      { name: "asset_", type: "address" },
      { name: "amountTotal_", type: "uint128" },
      { name: "amountPerLesson_", type: "uint128" },
      { name: "maxReleases_", type: "uint16" },
      { name: "durationSeconds_", type: "uint64" },
      { name: "agreementHash_", type: "bytes32" },
      { name: "disputeModule_", type: "address" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
  },
];

function readEnv(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function normalizeTypedData(raw) {
  const td = raw.typedData ?? raw;
  const { domain, types, primaryType, message } = td;
  const fields = types[primaryType];
  const normalized = { ...message };
  for (const f of fields) {
    if (f.type === "uint256" || f.type === "uint128" || f.type === "uint64" || f.type === "uint16") {
      normalized[f.name] = BigInt(normalized[f.name]);
    }
  }
  return {
    domain: { ...domain, chainId: BigInt(domain.chainId) },
    types,
    primaryType,
    message: normalized,
  };
}

async function callApi(pathname, init) {
  const base = readEnv("BASE", "http://127.0.0.1:8787");
  const url = `${base}/api/payfi/v1${pathname}`;
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.detail || `${res.status} ${res.statusText}`);
  return data;
}

/** USDC 等代币在非零 allowance 上改小额度时常需先 approve(spender, 0)。 */
async function ensureErc20Allowance(userWallet, publicClient, token, spender, owner, need) {
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  const hashes = [];
  if (allowance >= need) {
    return hashes;
  }
  if (allowance > 0n) {
    const h0 = await userWallet.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, 0n],
    });
    await publicClient.waitForTransactionReceipt({ hash: h0 });
    hashes.push(h0);
  }
  const h1 = await userWallet.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, need],
  });
  await publicClient.waitForTransactionReceipt({ hash: h1 });
  hashes.push(h1);
  return hashes;
}

async function performOneRelease(intentId, user, merchant) {
  const intent = await callApi(`/intents/${encodeURIComponent(intentId)}`);
  if (intent.status === "settled" || intent.status === "refunded") {
    return {
      ok: true,
      skipped: true,
      terminal: true,
      reason: `intent already ${intent.status}`,
      intentId,
      status: intent.status,
      releaseCount: intent.releaseCount,
      releasedTotal: intent.releasedTotal,
    };
  }

  const prep = await callApi(`/intents/${encodeURIComponent(intentId)}/release/prepare`, {
    method: "POST",
  });
  const td = normalizeTypedData(prep);
  const userSig = await user.signTypedData(td);
  const merchantSig = await merchant.signTypedData(td);
  const submit = await callApi(`/intents/${encodeURIComponent(intentId)}/release/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userSig, merchantSig }),
  });
  return { ok: true, userSig, merchantSig, submit };
}

async function main() {
  const args = parseArgs(process.argv);
  const cmd = args._[0] || "run";

  const chainId = Number(readEnv("CHAIN_ID", "31337"));
  const rpc = readEnv("CHAIN_RPC_URL", "http://127.0.0.1:8545");
  const chain = defineChain({
    id: chainId,
    name: "payfidemo-local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(rpc) });

  const userPk = readEnv("USER_PRIVATE_KEY");
  const merchantPk = readEnv("MERCHANT_PRIVATE_KEY");
  const deployerPk = readEnv("DEPLOYER_PRIVATE_KEY") || readEnv("SUBMITTER_PRIVATE_KEY");
  if (!userPk || !merchantPk || !deployerPk) {
    throw new Error("missing USER_PRIVATE_KEY / MERCHANT_PRIVATE_KEY / DEPLOYER_PRIVATE_KEY");
  }
  const user = privateKeyToAccount(userPk.startsWith("0x") ? userPk : `0x${userPk}`);
  const merchant = privateKeyToAccount(merchantPk.startsWith("0x") ? merchantPk : `0x${merchantPk}`);
  const deployer = privateKeyToAccount(deployerPk.startsWith("0x") ? deployerPk : `0x${deployerPk}`);
  const userWallet = createWalletClient({ account: user, chain, transport: http(rpc) });
  const deployerWallet = createWalletClient({ account: deployer, chain, transport: http(rpc) });

  if (cmd === "accounts") {
    console.log(JSON.stringify({ user: user.address, merchant: merchant.address, deployer: deployer.address }, null, 2));
    return;
  }

  if (cmd === "create") {
    const body = {
      merchant: merchant.address,
      user: user.address,
      asset: getAddress(readEnv("ASSET_ADDRESS")),
      amountTotal: String(args.amountTotal || "1000000000"),
      amountPerLesson: String(args.amountPerLesson || "100000000"),
      maxReleases: Number(args.maxReleases || 10),
      durationSeconds: Number(args.durationSeconds || 2_592_000),
      agreementHash: readEnv("AGREEMENT_HASH", "0x0000000000000000000000000000000000000000000000000000000000000000"),
      termsVersion: "1.0.0",
    };
    const created = await callApi("/intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(JSON.stringify(created, null, 2));
    return;
  }

  const intentId = String(args.intent || "").trim();
  if (!intentId) {
    throw new Error("missing --intent <intentId>");
  }

  if (cmd === "fund") {
    const hint = await callApi(`/intents/${encodeURIComponent(intentId)}/funding/hint`);
    const intent = await callApi(`/intents/${encodeURIComponent(intentId)}`);

    const userBal = await publicClient.readContract({
      address: intent.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [user.address],
    });
    const need = BigInt(intent.amountTotal);
    if (userBal < need) {
      const tx = await deployerWallet.writeContract({
        address: intent.asset,
        abi: erc20Abi,
        functionName: "transfer",
        args: [user.address, need - userBal],
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
    }

    const approveHashes = await ensureErc20Allowance(
      userWallet,
      publicClient,
      intent.asset,
      hint.to,
      user.address,
      need,
    );

    const fundHash = await userWallet.writeContract({
      address: hint.to,
      abi: escrowAbi,
      functionName: "createAndDeposit",
      args: [
        intent.merchant,
        intent.asset,
        BigInt(intent.amountTotal),
        BigInt(intent.amountPerLesson),
        Number(intent.maxReleases),
        BigInt(intent.durationSeconds),
        intent.anchor.agreementHash,
        "0x0000000000000000000000000000000000000000",
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });

    const posted = await callApi(`/intents/${encodeURIComponent(intentId)}/funding/tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash: fundHash }),
    });
    console.log(JSON.stringify({ approveHashes, fundHash, posted }, null, 2));
    return;
  }

  if (cmd === "release") {
    const out = await performOneRelease(intentId, user, merchant);
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === "release-until-settled") {
    const maxRounds = Number(args.max || 100);
    const rounds = [];
    for (let i = 0; i < maxRounds; i += 1) {
      const out = await performOneRelease(intentId, user, merchant);
      rounds.push(out);
      if (out.terminal) break;
      const status = out.submit?.status;
      if (status === "settled" || status === "refunded") break;
    }
    const last = rounds[rounds.length - 1] ?? null;
    console.log(
      JSON.stringify(
        {
          ok: true,
          intentId,
          rounds: rounds.length,
          finalStatus: last?.status || last?.submit?.status || "unknown",
          result: rounds,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === "run") {
    const asset = getAddress(readEnv("ASSET_ADDRESS"));
    const body = {
      merchant: merchant.address,
      user: user.address,
      asset,
      amountTotal: "1000000000",
      amountPerLesson: "100000000",
      maxReleases: 10,
      durationSeconds: 2_592_000,
      agreementHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      termsVersion: "1.0.0",
    };
    const created = await callApi("/intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const id = created.intentId;
    const hint = await callApi(`/intents/${encodeURIComponent(id)}/funding/hint`);
    const need = BigInt(body.amountTotal);
    const approveHashes = await ensureErc20Allowance(
      userWallet,
      publicClient,
      asset,
      hint.to,
      user.address,
      need,
    );
    const fundHash = await userWallet.writeContract({
      address: hint.to,
      abi: escrowAbi,
      functionName: "createAndDeposit",
      args: [
        merchant.address,
        asset,
        need,
        BigInt(body.amountPerLesson),
        body.maxReleases,
        BigInt(body.durationSeconds),
        body.agreementHash,
        "0x0000000000000000000000000000000000000000",
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: fundHash });
    await callApi(`/intents/${encodeURIComponent(id)}/funding/tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash: fundHash }),
    });
    const prep = await callApi(`/intents/${encodeURIComponent(id)}/release/prepare`, {
      method: "POST",
    });
    const td = normalizeTypedData(prep);
    const userSig = await user.signTypedData(td);
    const merchantSig = await merchant.signTypedData(td);
    const submit = await callApi(`/intents/${encodeURIComponent(id)}/release/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userSig, merchantSig }),
    });
    console.log(JSON.stringify({ intentId: id, approveHashes, fundHash, submit }, null, 2));
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
