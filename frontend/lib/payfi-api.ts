/** 优先使用服务端 `detail`（链上 revert / viem 原因），避免泛型 `error` 盖住真实信息 */
function apiFailMessage(
  data: { error?: string; detail?: string },
  fallback: string,
): string {
  const d = typeof data.detail === "string" ? data.detail.trim() : "";
  const e = typeof data.error === "string" ? data.error.trim() : "";
  if (d) return d;
  if (e) return e;
  return fallback;
}

/** 与 `apiRoot()` 同源，不含 `/api/payfi/v1`（用于 `/health`） */
export const payfiHttpBase = (): string => {
  const base =
    typeof process.env.NEXT_PUBLIC_PAYFI_API_URL === "string" &&
    process.env.NEXT_PUBLIC_PAYFI_API_URL.length > 0
      ? process.env.NEXT_PUBLIC_PAYFI_API_URL.replace(/\/$/, "")
      : "http://localhost:8787";
  return base;
};

const apiRoot = (): string => `${payfiHttpBase()}/api/payfi/v1`;

function fetchFailedHint(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const base = payfiHttpBase();
  const pointsToLocalHost =
    base.includes("localhost") || base.includes("127.0.0.1");
  if (!pointsToLocalHost) return `${msg} (${base})`;
  return `${msg} — NEXT_PUBLIC_PAYFI_API_URL is ${base}. On a deployed HTTPS site, set it to your public API base (https://…, no trailing slash) and redeploy the frontend.`;
}

export type PayFiHealthResponse = {
  ok: boolean;
  /** 服务端 intent 存储：`postgres` 表示已连接数据库；`memory` 为进程内内存 */
  persistence?: string;
  /** 与 `DATABASE_URL` 协议对应之产品名（如 PostgreSQL、MySQL）；无库时为 `null` */
  databaseProduct?: string | null;
};

export async function getPayFiHealth(): Promise<PayFiHealthResponse> {
  const res = await fetch(`${payfiHttpBase()}/health`, { cache: "no-store" });
  const data = (await res.json()) as PayFiHealthResponse;
  if (!res.ok) throw new Error("health failed");
  return data;
}

export async function triggerCrossSpaceDemo(): Promise<{
  ok: boolean;
  taskId: string;
  status: "running" | "success" | "failed";
  startedAt?: string;
}> {
  const res = await fetch(`${apiRoot()}/debug/cross-space/demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    taskId?: string;
    status?: "running" | "success" | "failed";
    startedAt?: string;
    error?: string;
    detail?: string;
  };
  if (!res.ok) throw new Error(apiFailMessage(data, "cross-space demo failed"));
  return {
    ok: data.ok ?? true,
    taskId: data.taskId ?? "",
    status: data.status ?? "running",
    startedAt: data.startedAt,
  };
}

export async function getCrossSpaceDemoTask(taskId: string): Promise<{
  taskId: string;
  status: "running" | "success" | "failed";
  stdout: string;
  stderr: string;
  error?: string;
  startedAt: string;
  endedAt?: string;
}> {
  const res = await fetch(`${apiRoot()}/debug/cross-space/demo/${encodeURIComponent(taskId)}`);
  const data = (await res.json()) as {
    taskId?: string;
    status?: "running" | "success" | "failed";
    stdout?: string;
    stderr?: string;
    error?: string;
    startedAt?: string;
    endedAt?: string;
    detail?: string;
  };
  if (!res.ok) throw new Error(apiFailMessage(data, "cross-space demo task query failed"));
  return {
    taskId: data.taskId ?? taskId,
    status: data.status ?? "running",
    stdout: data.stdout ?? "",
    stderr: data.stderr ?? "",
    error: data.error,
    startedAt: data.startedAt ?? "",
    endedAt: data.endedAt,
  };
}

export type IntentRecord = {
  intentId: string;
  merchant: string;
  user: string;
  asset: string;
  amountTotal: string;
  amountPerLesson: string;
  maxReleases: number;
  durationSeconds: number;
  status: string;
  escrowId: string | null;
  fundingTxHash: string | null;
  releaseCount: number;
  releasedTotal: string;
  expiresAt: number | null;
  releaseNonce: number;
  paymentUrl?: string;
  hskPaymentReqId?: string;
  /** HashKey cart_mandate_id（与网关 reusable 订单一致） */
  hskCartMandateId?: string;
  anchor: {
    agreementHash: string;
    termsVersion: string;
    disputeResolver?: string;
  };
  /** 新建 intent 时可选；GET 返回中可能包含（不含 webhookSecret） */
  webhookUrl?: string;
  userSig?: string;
  merchantSig?: string;
  /** ISO 8601：服务端保存签名时写入 */
  userSigAt?: string;
  merchantSigAt?: string;
  /** ISO 时间；列表排序与「最新在前」依赖此字段 */
  createdAt?: string;
};

export async function createIntent(body: Record<string, unknown>): Promise<{
  intentId: string;
  status: string;
  paymentUrl?: string | null;
  hskPaymentReqId?: string | null;
}> {
  let res: Response;
  try {
    res = await fetch(`${apiRoot()}/intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(fetchFailedHint(e));
  }
  const data: {
    error?: string;
    detail?: string;
    intentId?: string;
    status?: string;
    paymentUrl?: string | null;
    hskPaymentReqId?: string | null;
  } =
    await res.json();
  if (!res.ok) throw new Error(apiFailMessage(data, "create failed"));
  return {
    intentId: data.intentId!,
    status: data.status!,
    paymentUrl: data.paymentUrl ?? null,
    hskPaymentReqId: data.hskPaymentReqId ?? null,
  };
}

export async function getIntent(intentId: string): Promise<IntentRecord> {
  const res = await fetch(`${apiRoot()}/intents/${encodeURIComponent(intentId)}`);
  const data: IntentRecord & { error?: string } = await res.json();
  if (!res.ok) throw new Error(data.error || "get intent failed");
  return data;
}

export async function listIntents(): Promise<IntentRecord[]> {
  const res = await fetch(`${apiRoot()}/intents`);
  const data: { intents?: IntentRecord[]; error?: string } = await res.json();
  if (!res.ok) throw new Error(data.error || "list intents failed");
  return data.intents ?? [];
}

export type CoreIntentLinkRecord = {
  coreOrderId: string;
  escrowId: string;
  intentId?: string;
  mappedTxHash?: string;
  createdAt: string;
  updatedAt: string;
};

export async function getCoreIntentLinkByIntentId(
  intentId: string,
): Promise<CoreIntentLinkRecord | null> {
  const res = await fetch(`${apiRoot()}/intents/core-links/by-intent/${encodeURIComponent(intentId)}`);
  if (res.status === 404) return null;
  const data = (await res.json()) as { link?: CoreIntentLinkRecord; error?: string };
  if (!res.ok) throw new Error(data.error || "get core-intent link failed");
  return data.link ?? null;
}

export async function getCoreIntentLinkByEscrowId(
  escrowId: string,
): Promise<CoreIntentLinkRecord | null> {
  const res = await fetch(`${apiRoot()}/intents/core-links/by-escrow/${encodeURIComponent(escrowId)}`);
  if (res.status === 404) return null;
  const data = (await res.json()) as { link?: CoreIntentLinkRecord; error?: string };
  if (!res.ok) throw new Error(data.error || "get core-intent link failed");
  return data.link ?? null;
}

export async function fundingHint(intentId: string): Promise<{
  to: string;
  data: `0x${string}`;
  value: string;
  note?: string;
}> {
  const res = await fetch(
    `${apiRoot()}/intents/${encodeURIComponent(intentId)}/funding/hint`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "funding hint failed");
  return data;
}

export async function postFundingTx(
  intentId: string,
  txHash: `0x${string}`,
): Promise<{ ok: boolean; status?: string; escrowId?: string; chain?: boolean }> {
  const res = await fetch(
    `${apiRoot()}/intents/${encodeURIComponent(intentId)}/funding/tx`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(apiFailMessage(data, "funding/tx failed"));
  return data;
}

export async function autoFundIntentDemo(intentId: string): Promise<{
  ok: boolean;
  intentId?: string;
  status?: string;
  escrowId?: string;
  approveTxHash?: string | null;
  fundingTxHash?: string;
  payer?: string;
  chain?: boolean;
}> {
  const res = await fetch(
    `${apiRoot()}/intents/${encodeURIComponent(intentId)}/funding/auto-demo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(apiFailMessage(data, "auto funding failed"));
  return data;
}

export type ReleasePrepareResponse = {
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  intentId: string;
  note?: string;
};

export async function releasePrepare(
  intentId: string,
): Promise<ReleasePrepareResponse> {
  const res = await fetch(
    `${apiRoot()}/intents/${encodeURIComponent(intentId)}/release/prepare`,
    { method: "POST" },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "release prepare failed");
  return data;
}

/** `POST .../release/submit` 成功体：含链上提交后最新计数，便于前端立即刷新 UI */
export type ReleaseSubmitResponse = {
  ok: boolean;
  intentId?: string;
  status: string;
  releaseNonce: number;
  releaseCount: number;
  releasedTotal: string;
  txHash: string;
  chain?: boolean;
  demoNote?: string;
};

export async function releaseSubmit(
  intentId: string,
  userSig: `0x${string}`,
  merchantSig: `0x${string}`,
): Promise<ReleaseSubmitResponse> {
  const res = await fetch(
    `${apiRoot()}/intents/${encodeURIComponent(intentId)}/release/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userSig, merchantSig }),
    },
  );
  const data = (await res.json()) as ReleaseSubmitResponse & { error?: string; detail?: string };
  if (!res.ok) throw new Error(apiFailMessage(data, "release submit failed"));
  return data;
}

export async function getReleaseSignatures(intentId: string): Promise<{
  intentId: string;
  userSig: `0x${string}` | null;
  merchantSig: `0x${string}` | null;
  userSigAt: string | null;
  merchantSigAt: string | null;
}> {
  const res = await fetch(`${apiRoot()}/intents/${encodeURIComponent(intentId)}/release/signatures`);
  if (!res.ok) {
    // Backward compatibility: older API versions may not have this endpoint yet.
    if (res.status === 404) {
      return { intentId, userSig: null, merchantSig: null, userSigAt: null, merchantSigAt: null };
    }
    let data: { error?: string } = {};
    try {
      data = await res.json();
    } catch {
      // non-JSON error body
    }
    throw new Error(data.error || "get release signatures failed");
  }
  const data = (await res.json()) as {
    intentId?: string;
    userSig?: `0x${string}` | null;
    merchantSig?: `0x${string}` | null;
    userSigAt?: string | null;
    merchantSigAt?: string | null;
  };
  return {
    intentId: data.intentId ?? intentId,
    userSig: data.userSig ?? null,
    merchantSig: data.merchantSig ?? null,
    userSigAt: data.userSigAt ?? null,
    merchantSigAt: data.merchantSigAt ?? null,
  };
}

export async function saveReleaseSignature(
  intentId: string,
  role: "user" | "merchant",
  signature: `0x${string}`,
): Promise<{
  ok: boolean;
  userSig: `0x${string}` | null;
  merchantSig: `0x${string}` | null;
  userSigAt?: string | null;
  merchantSigAt?: string | null;
}> {
  const res = await fetch(
    `${apiRoot()}/intents/${encodeURIComponent(intentId)}/release/signatures`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, signature }),
    },
  );
  if (!res.ok) {
    // Backward compatibility: allow frontend to continue with local fallback.
    if (res.status === 404) {
      return {
        ok: true,
        userSig: role === "user" ? signature : null,
        merchantSig: role === "merchant" ? signature : null,
        userSigAt: null,
        merchantSigAt: null,
      };
    }
    let data: { error?: string } = {};
    try {
      data = await res.json();
    } catch {
      // non-JSON error body
    }
    throw new Error(data.error || "save release signature failed");
  }
  const data = (await res.json()) as {
    ok?: boolean;
    userSig?: `0x${string}` | null;
    merchantSig?: `0x${string}` | null;
    userSigAt?: string | null;
    merchantSigAt?: string | null;
  };
  return {
    ok: data.ok ?? true,
    userSig: data.userSig ?? null,
    merchantSig: data.merchantSig ?? null,
    userSigAt: data.userSigAt ?? null,
    merchantSigAt: data.merchantSigAt ?? null,
  };
}

export async function refundIntent(
  intentId: string,
): Promise<{ ok: boolean; status?: string; txHash?: string; chain?: boolean }> {
  const res = await fetch(`${apiRoot()}/intents/${encodeURIComponent(intentId)}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(apiFailMessage(data, "refund failed"));
  return data;
}

export type SettlementOutboxEvent = {
  id: string;
  kind: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export async function getSettlementOutboxEvents(): Promise<SettlementOutboxEvent[]> {
  const res = await fetch(`${apiRoot()}/debug/settlement-outbox`);
  const data: { events?: SettlementOutboxEvent[]; error?: string } = await res.json();
  if (!res.ok) throw new Error(data.error || "get settlement outbox failed");
  return data.events ?? [];
}

/** Server explains why txMatch is null — not every case is an error (e.g. chain-funded escrow vs HSP checkout). */
export type GatewayReconciliationHintCode =
  | "gateway_payment_required_local_funded"
  | "gateway_no_tx_local_funded"
  | "local_funding_tx_missing"
  | "no_hashes_to_compare";

export type GatewayReconciliationResponse = {
  intentId: string;
  query: {
    cartMandateId: string | null;
    paymentRequestId: string | null;
    lookupTried: ("cart_mandate_id" | "payment_request_id" | "flow_id")[];
    lookupSelected: "cart_mandate_id" | "payment_request_id" | "flow_id";
    selectedFlowId: string | null;
  };
  local: {
    status: string;
    fundingTxHash: string | null;
    escrowId: string | null;
  };
  gateway: {
    items: Record<string, unknown>[];
    primary: Record<string, unknown> | null;
  };
  reconciliation: {
    gatewayTxSignature: string | null;
    localFundingTxHash: string | null;
    txMatch: boolean | null;
    explorerGatewayTxUrl: string | null;
    explorerLocalTxUrl: string | null;
    /** Omitted on older API builds; treat missing as null. */
    comparisonHintCode?: GatewayReconciliationHintCode | null;
  };
};

export async function getGatewayReconciliation(
  intentId: string,
): Promise<GatewayReconciliationResponse> {
  const res = await fetch(
    `${apiRoot()}/intents/${encodeURIComponent(intentId)}/gateway-reconciliation`,
  );
  const data = (await res.json()) as GatewayReconciliationResponse & { error?: string; detail?: string };
  if (!res.ok) throw new Error(data.detail || data.error || "gateway reconciliation failed");
  return data;
}
