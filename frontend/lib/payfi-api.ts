const apiRoot = (): string => {
  const base =
    typeof process.env.NEXT_PUBLIC_PAYFI_API_URL === "string" &&
    process.env.NEXT_PUBLIC_PAYFI_API_URL.length > 0
      ? process.env.NEXT_PUBLIC_PAYFI_API_URL.replace(/\/$/, "")
      : "http://127.0.0.1:8787";
  return `${base}/api/payfi/v1`;
};

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
  anchor: {
    agreementHash: string;
    termsVersion: string;
    disputeResolver?: string;
  };
};

export async function createIntent(body: Record<string, unknown>): Promise<{
  intentId: string;
  status: string;
}> {
  const res = await fetch(`${apiRoot()}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: { error?: string; intentId?: string; status?: string } =
    await res.json();
  if (!res.ok) throw new Error(data.error || "create failed");
  return { intentId: data.intentId!, status: data.status! };
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
  if (!res.ok) throw new Error(data.error || data.detail || "funding/tx failed");
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

export async function releaseSubmit(
  intentId: string,
  userSig: `0x${string}`,
  merchantSig: `0x${string}`,
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${apiRoot()}/intents/${encodeURIComponent(intentId)}/release/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userSig, merchantSig }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.detail || "release submit failed");
  return data;
}

export type OutboxEvent = {
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

export async function getOutboxEvents(): Promise<OutboxEvent[]> {
  const res = await fetch(`${apiRoot()}/debug/hsp-outbox`);
  const data: { events?: OutboxEvent[]; error?: string } = await res.json();
  if (!res.ok) throw new Error(data.error || "get outbox failed");
  return data.events ?? [];
}
