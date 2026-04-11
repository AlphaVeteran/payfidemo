import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  encodeFunctionData,
  getAddress,
  isHash,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { withPgTransaction } from "../db/withTransaction.js";
import { getPgPool, isPersistenceEnabled } from "../db/pool.js";
import { intentStore } from "../store/intentStore.js";
import { pgSaveIntent } from "../store/postgresIntent.js";
import { logSettlementEvent } from "../settlement/logSettlementEvent.js";
import { settlementAdapter } from "../settlement/mockSettlementAdapter.js";
import { appendSettlementOutbox } from "../settlement/settlementOutbox.js";
import { dispatchWebhookDemo } from "../services/webhookStub.js";
import type { CreateIntentBody, IntentRecord } from "../types.js";
import { payFiEscrowAbi } from "../abi/payFiEscrow.js";
import {
  getPublicClient,
  getSubmitterWallet,
  isChainMode,
  parseChainIdFromEnv,
} from "../chain/config.js";
import { registerEscrowOnChain } from "../chain/escrow.js";
import { parseEscrowCreatedFromReceipt } from "../chain/funding.js";
import {
  collectFlowIdsFromPaymentPayload,
  createReusableOrder,
  normalizeMaybeTxHash,
  queryMerchantPayments,
  resolveGatewayTxForReconciliation,
} from "../hashkey/client.js";

const router = Router();

let demoEscrowCounter = 1;

/** viem `readContract(escrows)` 返回元组；统一转成可 JSON 落库的纯字段。 */
function escrowSnapshotFromEscrowsRead(raw: unknown): {
  releaseCount: number;
  releasedTotal: string;
  releaseNonce: number;
} {
  const t = raw as Record<number, unknown>;
  const rc = t[6];
  const rt = t[7];
  const rn = t[10];
  return {
    releaseCount: Number(rc ?? 0),
    releasedTotal:
      typeof rt === "bigint" ? rt.toString() : String(rt ?? "0"),
    releaseNonce: typeof rn === "bigint" ? Number(rn) : Number(rn ?? 0),
  };
}

function anchorFromBody(b: CreateIntentBody) {
  return {
    agreementHash: b.agreementHash,
    termsVersion: b.termsVersion,
    termsUri: b.termsUri,
    jurisdiction: b.jurisdiction,
    disputeResolver: b.disputeResolver,
  };
}

function clearReleaseSignatures(row: IntentRecord) {
  row.userSig = undefined;
  row.merchantSig = undefined;
}

router.post("/", async (req, res) => {
  const b = req.body as CreateIntentBody;
  if (
    !b?.merchant ||
    !b?.user ||
    !b?.asset ||
    !b?.amountTotal ||
    !b?.amountPerLesson ||
    typeof b.maxReleases !== "number" ||
    typeof b.durationSeconds !== "number" ||
    !b?.agreementHash ||
    !b?.termsVersion
  ) {
    res.status(400).json({ error: "missing required fields" });
    return;
  }
  const intentId = randomUUID();
  const record: IntentRecord = {
    intentId,
    merchant: getAddress(b.merchant),
    user: getAddress(b.user),
    asset: getAddress(b.asset),
    amountTotal: b.amountTotal,
    amountPerLesson: b.amountPerLesson,
    maxReleases: b.maxReleases,
    durationSeconds: b.durationSeconds,
    webhookUrl: b.webhookUrl,
    webhookSecret: b.webhookSecret,
    anchor: anchorFromBody(b),
    status: "awaiting_funding",
    escrowId: null,
    fundingTxHash: null,
    releaseCount: 0,
    releasedTotal: "0",
    expiresAt: null,
    releaseNonce: 0,
    createdAt: new Date().toISOString(),
    paymentUrl: undefined,
    hskPaymentReqId: undefined,
    userSig: undefined,
    merchantSig: undefined,
  };
  const createdEmitPayload = { intentId, escrowId: null, ...record.anchor };
  if (isPersistenceEnabled() && getPgPool()) {
    await withPgTransaction(async (client) => {
      await pgSaveIntent(record, client);
      await appendSettlementOutbox("INTENT_CREATED", createdEmitPayload, client);
    });
    logSettlementEvent("INTENT_CREATED", createdEmitPayload);
  } else {
    await intentStore.saveIntent(record);
    await settlementAdapter.emit("INTENT_CREATED", createdEmitPayload);
  }
  let hashkey: { ok: boolean; reason?: string; raw?: unknown } = { ok: false };
  try {
    const hsk = await createReusableOrder({
      intentId: record.intentId,
      merchant: record.merchant,
      amountTotal: record.amountTotal,
    });
    if (hsk.paymentUrl) {
      record.paymentUrl = hsk.paymentUrl;
    }
    if (hsk.paymentRequestId) {
      record.hskPaymentReqId = hsk.paymentRequestId;
    }
    if (hsk.cartMandateId) {
      record.hskCartMandateId = hsk.cartMandateId;
    }
    if (record.paymentUrl) {
      hashkey = { ok: true };
    } else {
      hashkey = {
        ok: false,
        reason: "HashKey returned no payment_url",
        raw: hsk.raw,
      };
      console.warn("[HashKey] reusable order ok but missing payment_url", hsk.raw);
    }
    await intentStore.saveIntent(record);
  } catch (e) {
    console.error("[HashKey] createReusableOrder failed:", e);
    hashkey = {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  res.status(201).json({
    intentId,
    status: record.status,
    paymentUrl: record.paymentUrl ?? null,
    hskPaymentReqId: record.hskPaymentReqId ?? null,
    hskCartMandateId: record.hskCartMandateId ?? null,
    hashkey,
  });
});

router.get("/", async (_req, res) => {
  const intents = await intentStore.listIntents();
  res.json({ intents: intents.map(sanitize) });
});

/** 生成 createAndDeposit 的 calldata，便于 cast / 钱包发起 */
router.get("/:intentId/funding/hint", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const escrow = process.env.ESCROW_ADDRESS?.trim();
  if (!escrow) {
    res.status(400).json({ error: "ESCROW_ADDRESS not set" });
    return;
  }
  try {
    let disputeModuleAddr: Address = zeroAddress;
    if (row.anchor.disputeResolver) {
      try {
        disputeModuleAddr = getAddress(row.anchor.disputeResolver);
      } catch (_e) {
        res.status(400).json({ error: "invalid disputeResolver address" });
        return;
      }
    }
    const data = encodeFunctionData({
      abi: payFiEscrowAbi,
      functionName: "createAndDeposit",
      args: [
        row.merchant as Address,
        row.asset as Address,
        BigInt(row.amountTotal),
        BigInt(row.amountPerLesson),
        row.maxReleases,
        BigInt(row.durationSeconds),
        row.anchor.agreementHash as Hex,
        disputeModuleAddr,
      ],
    });
    res.json({
      to: getAddress(escrow),
      data,
      value: "0x0",
      note: "由 intent.user 对应的钱包发送该交易；成功后把 txHash POST 到 .../funding/tx",
    });
  } catch (e) {
    res.status(500).json({
      error: "encode failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

/** HashKey Merchant GET /payments — dual-source reconciliation (HSP / gateway vs local intent + chain). */
router.get("/:intentId/gateway-reconciliation", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (!row.hskCartMandateId?.trim() && !row.hskPaymentReqId?.trim()) {
    res.status(400).json({
      error: "no HashKey gateway ids on intent",
      detail: "Create intent with HashKey reusable order enabled so hskCartMandateId / hskPaymentReqId are set.",
    });
    return;
  }
  try {
    /** PAY-REQ-* often returns a stub (`payment-required`); cart_mandate_id may too. Real tx is often on GET /payments?flow_id= from stub `flow_id`. */
    type PayFilter =
      | { cartMandateId: string }
      | { paymentRequestId: string }
      | { flowId: string };
    type PaymentPack = {
      envelope: Awaited<ReturnType<typeof queryMerchantPayments>>["envelope"];
      items: Awaited<ReturnType<typeof queryMerchantPayments>>["items"];
      resolved: ReturnType<typeof resolveGatewayTxForReconciliation>;
      params: PayFilter;
    };

    const plans: PayFilter[] = [];
    if (row.hskCartMandateId?.trim()) plans.push({ cartMandateId: row.hskCartMandateId.trim() });
    if (row.hskPaymentReqId?.trim()) plans.push({ paymentRequestId: row.hskPaymentReqId.trim() });

    const rawLocalFunding = row.fundingTxHash?.trim() ?? "";
    const ids = {
      cartMandateId: row.hskCartMandateId,
      paymentRequestId: row.hskPaymentReqId,
    };

    const lookupTried: ("cart_mandate_id" | "payment_request_id" | "flow_id")[] = [];
    let chosen: PaymentPack | undefined;
    let fallback: PaymentPack | undefined;
    let lastCodeError: { code?: number; msg?: string } | null = null;
    let lastFetchError: Error | null = null;

    const hasResolvedTx = (p: PaymentPack) =>
      Boolean(p.resolved.gatewayTx && normalizeMaybeTxHash(p.resolved.gatewayTx));

    for (const params of plans) {
      lookupTried.push("cartMandateId" in params ? "cart_mandate_id" : "payment_request_id");
      try {
        const { envelope, items } = await queryMerchantPayments(params);
        if (envelope.code !== undefined && envelope.code !== 0) {
          lastCodeError = { code: envelope.code, msg: envelope.msg };
          continue;
        }
        const resolved = resolveGatewayTxForReconciliation(items, ids, envelope.data, rawLocalFunding || null);
        const pack: PaymentPack = { envelope, items, resolved, params };
        if (hasResolvedTx(pack)) {
          chosen = pack;
          break;
        }
        if (!fallback) fallback = pack;
      } catch (e) {
        lastFetchError = e instanceof Error ? e : new Error(String(e));
      }
    }

    let final: PaymentPack | undefined = chosen ?? fallback;
    if (!final) {
      if (lastCodeError) {
        res.status(502).json({
          error: "HashKey gateway returned error code",
          code: lastCodeError.code,
          msg: lastCodeError.msg,
          intentId: row.intentId,
        });
        return;
      }
      res.status(502).json({
        error: "gateway reconciliation failed",
        detail: lastFetchError?.message ?? "no usable HashKey payment response",
      });
      return;
    }

    if (!hasResolvedTx(final)) {
      const flowIds = [
        ...new Set([
          ...collectFlowIdsFromPaymentPayload(final.envelope.data),
          ...collectFlowIdsFromPaymentPayload(final.items),
        ]),
      ];
      for (const fid of flowIds) {
        lookupTried.push("flow_id");
        try {
          const { envelope, items } = await queryMerchantPayments({ flowId: fid });
          if (envelope.code !== undefined && envelope.code !== 0) {
            lastCodeError = { code: envelope.code, msg: envelope.msg };
            continue;
          }
          const resolved = resolveGatewayTxForReconciliation(
            items,
            ids,
            envelope.data,
            rawLocalFunding || null,
          );
          const pack: PaymentPack = { envelope, items, resolved, params: { flowId: fid } };
          if (hasResolvedTx(pack)) {
            final = pack;
            break;
          }
        } catch (e) {
          lastFetchError = e instanceof Error ? e : new Error(String(e));
        }
      }
    }

    const { items, resolved, params } = final;
    const { primary, gatewayTx: gatewayTxRaw } = resolved;
    const gatewayNorm = gatewayTxRaw ? normalizeMaybeTxHash(gatewayTxRaw) : null;
    const localNorm = rawLocalFunding ? normalizeMaybeTxHash(rawLocalFunding) : null;
    const explorerBase =
      process.env.BLOCKSCOUT_URL?.trim().replace(/\/$/, "") || "https://testnet-explorer.hsk.xyz";
    const gatewayTxUrl = gatewayNorm ? `${explorerBase}/tx/${gatewayNorm}` : null;
    const localTxUrl = localNorm ? `${explorerBase}/tx/${localNorm}` : null;
    const match =
      gatewayNorm && localNorm ? gatewayNorm === localNorm : null;

    const gatewayPaymentStatus =
      primary && typeof primary === "object" && "status" in primary
        ? String((primary as { status?: unknown }).status ?? "").trim()
        : "";
    const gst = gatewayPaymentStatus.toLowerCase();

    type ComparisonHintCode =
      | "gateway_payment_required_local_funded"
      | "gateway_no_tx_local_funded"
      | "local_funding_tx_missing"
      | "no_hashes_to_compare";

    let comparisonHintCode: ComparisonHintCode | null = null;
    if (!gatewayNorm && !localNorm) {
      comparisonHintCode = "no_hashes_to_compare";
    } else if (!gatewayNorm && localNorm) {
      if (gst === "payment-required" || gst === "pending" || gst === "awaiting_payment") {
        comparisonHintCode = "gateway_payment_required_local_funded";
      } else {
        comparisonHintCode = "gateway_no_tx_local_funded";
      }
    } else if (gatewayNorm && !localNorm) {
      comparisonHintCode = "local_funding_tx_missing";
    }

    const lookupSelected: "cart_mandate_id" | "payment_request_id" | "flow_id" = "flowId" in params
      ? "flow_id"
      : "cartMandateId" in params
        ? "cart_mandate_id"
        : "payment_request_id";
    const selectedFlowId = "flowId" in params ? params.flowId : null;

    res.json({
      intentId: row.intentId,
      query: {
        cartMandateId: row.hskCartMandateId ?? null,
        paymentRequestId: row.hskPaymentReqId ?? null,
        lookupTried,
        lookupSelected,
        selectedFlowId,
      },
      local: {
        status: row.status,
        fundingTxHash: row.fundingTxHash,
        escrowId: row.escrowId,
      },
      gateway: {
        items,
        primary: primary ?? null,
      },
      reconciliation: {
        gatewayTxSignature: gatewayNorm ?? (gatewayTxRaw || null),
        localFundingTxHash: localNorm ?? (rawLocalFunding || null),
        txMatch: match,
        explorerGatewayTxUrl: gatewayTxUrl,
        explorerLocalTxUrl: localTxUrl,
        comparisonHintCode,
      },
    });
  } catch (e) {
    res.status(502).json({
      error: "gateway reconciliation failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

router.get("/:intentId", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(sanitize(row));
});

router.post("/:intentId/funding/tx", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const rawTxHash = (req.body as { txHash?: string })?.txHash;
  if (!rawTxHash || typeof rawTxHash !== "string") {
    res.status(400).json({ error: "txHash required" });
    return;
  }
  const txHash = rawTxHash.trim();
  if (!isHash(txHash)) {
    res.status(400).json({
      error: "invalid txHash",
      detail: "must be 32-byte hex: 0x followed by 64 hex digits",
      length: txHash.length,
    });
    return;
  }

  try {
    if (isChainMode()) {
      const escrowAddr = getAddress(process.env.ESCROW_ADDRESS!.trim());
      const parsed = await parseEscrowCreatedFromReceipt(escrowAddr, txHash);
      if (parsed) {
        if (parsed.user !== row.user) {
          res.status(400).json({ error: "user mismatch", onChain: parsed.user, intent: row.user });
          return;
        }
        if (parsed.merchant !== row.merchant) {
          res
            .status(400)
            .json({ error: "merchant mismatch", onChain: parsed.merchant, intent: row.merchant });
          return;
        }
        if (parsed.asset !== row.asset) {
          res.status(400).json({ error: "asset mismatch", onChain: parsed.asset, intent: row.asset });
          return;
        }
        if (parsed.amountTotal !== BigInt(row.amountTotal)) {
          res.status(400).json({
            error: "amountTotal mismatch",
            onChain: parsed.amountTotal.toString(),
            intent: row.amountTotal,
          });
          return;
        }
        if (parsed.agreementHash.toLowerCase() !== row.anchor.agreementHash.toLowerCase()) {
          res.status(400).json({ error: "agreementHash mismatch" });
          return;
        }

        row.fundingTxHash = txHash;
        row.escrowId = parsed.escrowId;
        row.status = "active";
        row.expiresAt = parsed.expiresAt;
        await intentStore.saveIntent(row);

        try {
          await settlementAdapter.emit("INTENT_FUNDED", {
            intentId: row.intentId,
            escrowId: parsed.escrowId,
            txHash,
            ...row.anchor,
          });
          await dispatchWebhookDemo({
            webhookUrl: row.webhookUrl,
            webhookSecret: row.webhookSecret,
            type: "INTENT_FUNDED",
            body: {
              intentId: row.intentId,
              escrowId: parsed.escrowId,
              txHash,
              agreementHash: row.anchor.agreementHash,
              termsVersion: row.anchor.termsVersion,
            },
          });
        } catch (sideErr) {
          console.error("[funding/tx] settlement outbox / webhook log failed:", sideErr);
        }
        res.json({
          ok: true,
          status: row.status,
          escrowId: parsed.escrowId,
          chain: true,
          fundingPath: "createAndDeposit",
        });
        return;
      }

      /** HashKey HSP (EIP-3009 / USDC) checkout tx has no EscrowCreated — same path as POST /webhooks/hashkey */
      try {
        const escrowId = await registerEscrowOnChain(row, txHash);
        row.fundingTxHash = txHash;
        row.escrowId = escrowId;
        row.expiresAt = Math.floor(Date.now() / 1000) + row.durationSeconds;
        row.status = "active";
        await intentStore.saveIntent(row);
        try {
          await settlementAdapter.emit("INTENT_FUNDED", {
            intentId: row.intentId,
            escrowId,
            txHash,
            ...row.anchor,
          });
          await dispatchWebhookDemo({
            webhookUrl: row.webhookUrl,
            webhookSecret: row.webhookSecret,
            type: "INTENT_FUNDED",
            body: {
              intentId: row.intentId,
              escrowId,
              txHash,
              agreementHash: row.anchor.agreementHash,
              termsVersion: row.anchor.termsVersion,
            },
          });
        } catch (sideErr) {
          console.error("[funding/tx] settlement outbox / webhook log failed:", sideErr);
        }
        res.json({
          ok: true,
          status: row.status,
          escrowId,
          chain: true,
          fundingPath: "registerDeposit",
        });
        return;
      } catch (regErr) {
        res.status(400).json({
          error: "funding tx not recognized for chain mode",
          detail:
            "Expected a receipt with EscrowCreated (createAndDeposit), or a HashKey checkout tx that registerDeposit accepts. " +
            (regErr instanceof Error ? regErr.message : String(regErr)),
        });
        return;
      }
    }

    const escrowId = String(demoEscrowCounter++);
    const now = Math.floor(Date.now() / 1000);
    row.fundingTxHash = txHash;
    row.escrowId = escrowId;
    row.status = "active";
    row.expiresAt = now + row.durationSeconds;
    const fundedPayload = {
      intentId: row.intentId,
      escrowId,
      txHash,
      ...row.anchor,
    };
    if (isPersistenceEnabled() && getPgPool()) {
      await withPgTransaction(async (client) => {
        await pgSaveIntent(row, client);
        await appendSettlementOutbox("INTENT_FUNDED", fundedPayload, client);
      });
      logSettlementEvent("INTENT_FUNDED", fundedPayload);
    } else {
      await intentStore.saveIntent(row);
      await settlementAdapter.emit("INTENT_FUNDED", fundedPayload);
    }
    await dispatchWebhookDemo({
      webhookUrl: row.webhookUrl,
      webhookSecret: row.webhookSecret,
      type: "INTENT_FUNDED",
      body: {
        intentId: row.intentId,
        escrowId,
        txHash,
        agreementHash: row.anchor.agreementHash,
        termsVersion: row.anchor.termsVersion,
      },
    });
    res.json({ ok: true, status: row.status, escrowId, chain: false });
  } catch (e) {
    res.status(502).json({
      error: "funding confirm failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

router.post("/:intentId/release/prepare", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (row.status !== "active" && row.status !== "partially_settled") {
    res.status(400).json({ error: `invalid status: ${row.status}` });
    return;
  }
  if (!row.escrowId) {
    res.status(400).json({ error: "not funded" });
    return;
  }
  if (isChainMode()) {
    const escrowAddr = getAddress(process.env.ESCROW_ADDRESS!.trim());
    const publicClient = getPublicClient();
    const eid = BigInt(row.escrowId);
    const raw = await publicClient.readContract({
      address: escrowAddr,
      abi: payFiEscrowAbi,
      functionName: "escrows",
      args: [eid],
    });
    const snap = escrowSnapshotFromEscrowsRead(raw);
    const needsSave =
      snap.releaseNonce !== row.releaseNonce ||
      snap.releaseCount !== row.releaseCount ||
      snap.releasedTotal !== row.releasedTotal;
    if (needsSave) {
      row.releaseNonce = snap.releaseNonce;
      row.releaseCount = snap.releaseCount;
      row.releasedTotal = snap.releasedTotal;
      clearReleaseSignatures(row);
      if (row.releasedTotal === row.amountTotal) {
        row.status = "settled";
      } else if (row.releaseCount > 0) {
        row.status = "partially_settled";
      } else {
        row.status = "active";
      }
      await intentStore.saveIntent(row);
    }
  }
  const chainId = parseChainIdFromEnv();
  const verifying = process.env.ESCROW_ADDRESS?.trim()
    ? getAddress(process.env.ESCROW_ADDRESS.trim())
    : "0x0000000000000000000000000000000000000000";
  const amount = row.amountPerLesson;
  /** 与合约 PayFiEscrow.RELEASE_TYPEHASH 一致（不含 termsVersion） */
  const typedData = {
    domain: {
      name: "PayFiEscrowDemo",
      version: "1",
      chainId,
      verifyingContract: verifying,
    },
    types: {
      Release: [
        { name: "escrowId", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "merchant", type: "address" },
        { name: "agreementHash", type: "bytes32" },
      ],
    },
    primaryType: "Release" as const,
    message: {
      escrowId: row.escrowId,
      nonce: String(row.releaseNonce),
      amount,
      merchant: row.merchant,
      agreementHash: row.anchor.agreementHash,
    },
  };
  res.json({
    typedData,
    intentId: row.intentId,
    note: "termsVersion 仅存 intent / Webhook，不参与链上 EIP-712。",
  });
});

router.get("/:intentId/release/signatures", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({
    intentId: row.intentId,
    userSig: row.userSig ?? null,
    merchantSig: row.merchantSig ?? null,
  });
});

router.post("/:intentId/release/signatures", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { role, signature } = req.body as { role?: "user" | "merchant"; signature?: string };
  if ((role !== "user" && role !== "merchant") || !signature) {
    res.status(400).json({ error: "role(user|merchant) and signature required" });
    return;
  }
  const sig = signature.trim();
  if (!/^0x[0-9a-fA-F]{130}$/i.test(sig)) {
    res.status(400).json({ error: "invalid signature format" });
    return;
  }
  // 只更新对应角色；勿在保存用户签时清空商家签（否则「商家先签 → 用户后签」会丢失商家签）。
  // 链上 nonce 变化时由 prepare 读链或 release/submit 成功路径上的 clearReleaseSignatures 统一清空。
  if (role === "user") {
    row.userSig = sig;
  } else {
    row.merchantSig = sig;
  }
  await intentStore.saveIntent(row);
  res.json({
    ok: true,
    intentId: row.intentId,
    userSig: row.userSig ?? null,
    merchantSig: row.merchantSig ?? null,
  });
});

router.post("/:intentId/release/submit", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { userSig, merchantSig } = req.body as {
    userSig?: string;
    merchantSig?: string;
  };
  const finalUserSig = userSig ?? row.userSig;
  const finalMerchantSig = merchantSig ?? row.merchantSig;
  if (!finalUserSig || !finalMerchantSig) {
    res.status(400).json({ error: "userSig and merchantSig required" });
    return;
  }
  if (row.status !== "active" && row.status !== "partially_settled") {
    res.status(400).json({ error: `invalid status: ${row.status}` });
    return;
  }
  if (row.releaseCount >= row.maxReleases) {
    res.status(400).json({ error: "max releases reached" });
    return;
  }
  const per = BigInt(row.amountPerLesson);
  const total = BigInt(row.amountTotal);
  const released = BigInt(row.releasedTotal);
  if (released + per > total) {
    res.status(400).json({ error: "would exceed amountTotal" });
    return;
  }

  try {
    if (isChainMode()) {
      const escrowAddr = getAddress(process.env.ESCROW_ADDRESS!.trim());
      const publicClient = getPublicClient();
      const eid = BigInt(row.escrowId!);
      const onChain = await publicClient.readContract({
        address: escrowAddr,
        abi: payFiEscrowAbi,
        functionName: "escrows",
        args: [eid],
      });
      const snap0 = escrowSnapshotFromEscrowsRead(onChain);
      const onChainNonce = BigInt(snap0.releaseNonce);
      if (onChainNonce !== BigInt(row.releaseNonce)) {
        const localBefore = row.releaseNonce;
        // Self-heal local snapshot from chain when nonce drifts (e.g. another client already released).
        row.releaseCount = snap0.releaseCount;
        row.releasedTotal = snap0.releasedTotal;
        row.releaseNonce = snap0.releaseNonce;
        clearReleaseSignatures(row);
        if (row.releasedTotal === row.amountTotal) {
          row.status = "settled";
        } else if (row.releaseCount > 0) {
          row.status = "partially_settled";
        } else {
          row.status = "active";
        }
        await intentStore.saveIntent(row);

        res.status(409).json({
          error: "releaseNonce desync",
          onChain: onChainNonce.toString(),
          local: localBefore,
          synced: true,
          status: row.status,
          releaseCount: row.releaseCount,
          releasedTotal: row.releasedTotal,
        });
        return;
      }

      const walletClient = getSubmitterWallet();
      try {
        await publicClient.simulateContract({
          address: escrowAddr,
          abi: payFiEscrowAbi,
          functionName: "releaseBySignatures",
          args: [eid, per, finalUserSig as Hex, finalMerchantSig as Hex],
          account: walletClient.account,
        });
      } catch (simErr) {
        res.status(502).json({
          error: "release submit failed",
          detail: simErr instanceof Error ? simErr.message : String(simErr),
        });
        return;
      }

      const hash = await walletClient.writeContract({
        address: escrowAddr,
        abi: payFiEscrowAbi,
        functionName: "releaseBySignatures",
        args: [eid, per, finalUserSig as Hex, finalMerchantSig as Hex],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        res.status(502).json({
          error: "release submit failed",
          detail: `transaction mined with failed status: ${hash}`,
          txHash: hash,
        });
        return;
      }

      const after = await publicClient.readContract({
        address: escrowAddr,
        abi: payFiEscrowAbi,
        functionName: "escrows",
        args: [eid],
        ...(receipt.blockNumber != null ? { blockNumber: receipt.blockNumber } : {}),
      });
      const snap = escrowSnapshotFromEscrowsRead(after);
      row.releaseCount = snap.releaseCount;
      row.releasedTotal = snap.releasedTotal;
      row.releaseNonce = snap.releaseNonce;
      row.status = row.releasedTotal === row.amountTotal ? "settled" : "partially_settled";
      clearReleaseSignatures(row);
      await intentStore.saveIntent(row);

      await settlementAdapter.emit("SETTLEMENT_RELEASED", {
        intentId: row.intentId,
        escrowId: row.escrowId,
        amount: row.amountPerLesson,
        releaseIndex: row.releaseCount,
        txHash: hash,
        ...row.anchor,
      });
      await dispatchWebhookDemo({
        webhookUrl: row.webhookUrl,
        webhookSecret: row.webhookSecret,
        type: "SETTLEMENT_RELEASED",
        body: {
          intentId: row.intentId,
          escrowId: row.escrowId,
          amount: row.amountPerLesson,
          releaseIndex: row.releaseCount,
          txHash: hash,
          agreementHash: row.anchor.agreementHash,
          termsVersion: row.anchor.termsVersion,
        },
      });
      res.json({
        ok: true,
        status: row.status,
        releaseCount: row.releaseCount,
        releasedTotal: row.releasedTotal,
        txHash: hash,
        chain: true,
      });
      return;
    }

    row.releaseNonce += 1;
    row.releaseCount += 1;
    row.releasedTotal = (released + per).toString();
    row.status = row.releasedTotal === row.amountTotal ? "settled" : "partially_settled";
    clearReleaseSignatures(row);
    const txHashDemo = `0x${"ab".repeat(32)}`;
    const releasedPayload = {
      intentId: row.intentId,
      escrowId: row.escrowId,
      amount: row.amountPerLesson,
      releaseIndex: row.releaseCount,
      txHash: txHashDemo,
      ...row.anchor,
    };
    if (isPersistenceEnabled() && getPgPool()) {
      await withPgTransaction(async (client) => {
        await pgSaveIntent(row, client);
        await appendSettlementOutbox("SETTLEMENT_RELEASED", releasedPayload, client);
      });
      logSettlementEvent("SETTLEMENT_RELEASED", releasedPayload);
    } else {
      await intentStore.saveIntent(row);
      await settlementAdapter.emit("SETTLEMENT_RELEASED", releasedPayload);
    }
    await dispatchWebhookDemo({
      webhookUrl: row.webhookUrl,
      webhookSecret: row.webhookSecret,
      type: "SETTLEMENT_RELEASED",
      body: {
        intentId: row.intentId,
        escrowId: row.escrowId,
        amount: row.amountPerLesson,
        releaseIndex: row.releaseCount,
        txHash: txHashDemo,
        agreementHash: row.anchor.agreementHash,
        termsVersion: row.anchor.termsVersion,
      },
    });
    res.json({
      ok: true,
      status: row.status,
      releaseCount: row.releaseCount,
      releasedTotal: row.releasedTotal,
      txHash: txHashDemo,
      chain: false,
      demoNote: "未配置链上模式；交易哈希为占位",
    });
  } catch (e) {
    res.status(502).json({
      error: "release submit failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

router.post("/:intentId/refund", async (req, res) => {
  const row = await intentStore.getIntent(req.params.intentId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!row.expiresAt || now < row.expiresAt) {
    res.status(400).json({ error: "not yet expired", expiresAt: row.expiresAt });
    return;
  }
  if (row.status === "refunded") {
    res.json({ ok: true, status: row.status });
    return;
  }

  try {
    if (isChainMode() && row.escrowId) {
      const escrowAddr = getAddress(process.env.ESCROW_ADDRESS!.trim());
      const publicClient = getPublicClient();
      const walletClient = getSubmitterWallet();
      const eid = BigInt(row.escrowId);
      const hash = await walletClient.writeContract({
        address: escrowAddr,
        abi: payFiEscrowAbi,
        functionName: "refund",
        args: [eid],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        res.status(502).json({ error: "refund tx reverted", txHash: hash });
        return;
      }
      row.status = "refunded";
      await intentStore.saveIntent(row);
      await settlementAdapter.emit("INTENT_REFUNDED", {
        intentId: row.intentId,
        escrowId: row.escrowId,
        remaining: (BigInt(row.amountTotal) - BigInt(row.releasedTotal)).toString(),
        txHash: hash,
        ...row.anchor,
      });
      await dispatchWebhookDemo({
        webhookUrl: row.webhookUrl,
        webhookSecret: row.webhookSecret,
        type: "INTENT_REFUNDED",
        body: {
          intentId: row.intentId,
          escrowId: row.escrowId,
          txHash: hash,
          agreementHash: row.anchor.agreementHash,
          termsVersion: row.anchor.termsVersion,
        },
      });
      res.json({ ok: true, status: row.status, txHash: hash, chain: true });
      return;
    }

    row.status = "refunded";
    const refundedPayload = {
      intentId: row.intentId,
      escrowId: row.escrowId,
      remaining: (BigInt(row.amountTotal) - BigInt(row.releasedTotal)).toString(),
      ...row.anchor,
    };
    if (isPersistenceEnabled() && getPgPool()) {
      await withPgTransaction(async (client) => {
        await pgSaveIntent(row, client);
        await appendSettlementOutbox("INTENT_REFUNDED", refundedPayload, client);
      });
      logSettlementEvent("INTENT_REFUNDED", refundedPayload);
    } else {
      await intentStore.saveIntent(row);
      await settlementAdapter.emit("INTENT_REFUNDED", refundedPayload);
    }
    await dispatchWebhookDemo({
      webhookUrl: row.webhookUrl,
      webhookSecret: row.webhookSecret,
      type: "INTENT_REFUNDED",
      body: {
        intentId: row.intentId,
        escrowId: row.escrowId,
        agreementHash: row.anchor.agreementHash,
        termsVersion: row.anchor.termsVersion,
      },
    });
    res.json({ ok: true, status: row.status, chain: false });
  } catch (e) {
    res.status(502).json({
      error: "refund failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});

function sanitize(row: IntentRecord) {
  const { webhookSecret: _ws, ...rest } = row;
  return rest;
}

export default router;
