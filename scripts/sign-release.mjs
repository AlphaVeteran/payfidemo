#!/usr/bin/env node
/**
 * 读取 `POST .../release/prepare` 的 JSON（整段或仅 `typedData`），
 * 用用户与商家私钥各签一次 EIP-712，输出 submit 所需的 userSig / merchantSig。
 *
 * 用法：
 *   curl -sS "$BASE/api/payfi/v1/intents/$INTENT_ID/release/prepare" | \
 *     USER_PRIVATE_KEY=0x... MERCHANT_PRIVATE_KEY=0x... node scripts/sign-release.mjs
 *
 * 或：
 *   USER_PRIVATE_KEY=0x... MERCHANT_PRIVATE_KEY=0x... node scripts/sign-release.mjs prepare.json
 *
 * 可选参数（覆盖环境变量）：
 *   --user-key 0x...
 *   --merchant-key 0x...
 */

import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

function usage() {
  console.error(`Usage:
  USER_PRIVATE_KEY=0x.. MERCHANT_PRIVATE_KEY=0x.. node scripts/sign-release.mjs [prepare.json]
  curl .../release/prepare | USER_PRIVATE_KEY=0x.. MERCHANT_PRIVATE_KEY=0x.. node scripts/sign-release.mjs
  Optional: --user-key 0x.. --merchant-key 0x..`);
}

function normalizePk(v) {
  if (!v || typeof v !== "string") throw new Error("private key missing");
  const t = v.trim();
  return t.startsWith("0x") ? t : `0x${t}`;
}

function parseArgs(argv) {
  let userKey = process.env.USER_PRIVATE_KEY;
  let merchantKey = process.env.MERCHANT_PRIVATE_KEY;
  const files = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-key") userKey = argv[++i];
    else if (a === "--merchant-key") merchantKey = argv[++i];
    else if (!a.startsWith("-")) files.push(a);
  }
  return { userKey: normalizePk(userKey), merchantKey: normalizePk(merchantKey), file: files[0] };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function readJsonInput(file) {
  if (file) {
    return JSON.parse(readFileSync(file, "utf8"));
  }
  const raw = await readStdin();
  if (!raw) throw new Error("stdin empty and no file given");
  return JSON.parse(raw);
}

/** viem 对 uint256 消息字段需要 bigint */
function normalizeTypedData(raw) {
  const td = raw.typedData ?? raw;
  const { domain, types, primaryType, message } = td;
  if (!domain || !types || !primaryType || !message) {
    throw new Error("expected typedData with domain, types, primaryType, message");
  }
  const fields = types[primaryType];
  if (!fields) throw new Error(`types.${primaryType} missing`);
  const m = { ...message };
  for (const f of fields) {
    if (f.type === "uint256") {
      m[f.name] = BigInt(m[f.name]);
    }
  }
  return {
    domain: {
      ...domain,
      chainId: BigInt(domain.chainId),
    },
    types,
    primaryType,
    message: m,
  };
}

async function main() {
  const { userKey, merchantKey, file } = parseArgs(process.argv);
  let payload;
  try {
    payload = await readJsonInput(file);
  } catch (e) {
    usage();
    throw e;
  }

  const typedData = normalizeTypedData(payload);

  const userAcc = privateKeyToAccount(userKey);
  const merchantAcc = privateKeyToAccount(merchantKey);

  const userSig = await userAcc.signTypedData(typedData);
  const merchantSig = await merchantAcc.signTypedData(typedData);

  console.log(
    JSON.stringify(
      {
        user: userAcc.address,
        merchant: merchantAcc.address,
        userSig,
        merchantSig,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
