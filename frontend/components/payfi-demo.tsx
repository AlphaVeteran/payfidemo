"use client";

import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSendTransaction,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { erc20Abi, getAddress, recoverTypedDataAddress } from "viem";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createIntent,
  fundingHint,
  getIntent,
  postFundingTx,
  releasePrepare,
  releaseSubmit,
  type IntentRecord,
  type ReleasePrepareResponse,
} from "@/lib/payfi-api";
import { domainFromApi, releaseMessageFromApi } from "@/lib/release-typed-data";
import { targetChain, targetChainId } from "@/lib/wagmi-config";

const defaultCreateBody = {
  merchant: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  asset: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  amountTotal: "1000000000",
  amountPerLesson: "100000000",
  maxReleases: 10,
  durationSeconds: 2_592_000,
  agreementHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  termsVersion: "1.0.0",
};

type StoredReleaseState = {
  userSig: `0x${string}` | null;
  merchantSig: `0x${string}` | null;
  releasePrep: ReleasePrepareResponse | null;
};

function releaseStoreKey(intentId: string) {
  return `payfi.release.${intentId}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

export default function PayFiDemo() {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switchPending } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { signTypedDataAsync } = useSignTypedData();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveIsConnected = mounted ? isConnected : false;
  const effectiveChainId = mounted ? chainId : targetChainId;
  const effectiveAddress = mounted ? address : null;

  const [intentId, setIntentId] = useState("");
  const [intent, setIntent] = useState<IntentRecord | null>(null);
  const [formJson, setFormJson] = useState(JSON.stringify(defaultCreateBody, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [userSig, setUserSig] = useState<`0x${string}` | null>(null);
  const [merchantSig, setMerchantSig] = useState<`0x${string}` | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [releaseResult, setReleaseResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [releasePrep, setReleasePrep] = useState<ReleasePrepareResponse | null>(null);
  const [releaseHint, setReleaseHint] = useState<string | null>(null);

  const refreshIntent = useCallback(async () => {
    if (!intentId.trim()) {
      setIntent(null);
      return;
    }
    setError(null);
    const row = await getIntent(intentId.trim());
    setIntent(row);
  }, [intentId]);

  useEffect(() => {
    void refreshIntent();
  }, [refreshIntent]);

  useEffect(() => {
    if (!mounted) return;
    const id = intentId.trim();
    if (!id) {
      setUserSig(null);
      setMerchantSig(null);
      setReleasePrep(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(releaseStoreKey(id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredReleaseState;
      setUserSig(parsed.userSig ?? null);
      setMerchantSig(parsed.merchantSig ?? null);
      setReleasePrep(parsed.releasePrep ?? null);
    } catch {
      // ignore malformed cache
    }
  }, [intentId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const id = intentId.trim();
    if (!id) return;
    const snapshot: StoredReleaseState = { userSig, merchantSig, releasePrep };
    window.localStorage.setItem(releaseStoreKey(id), JSON.stringify(snapshot));
  }, [intentId, userSig, merchantSig, releasePrep, mounted]);

  const onWrongChain = effectiveChainId !== targetChainId;

  const preferredConnector = useMemo(
    () =>
      connectors.find((c) => /rabby/i.test(`${c.name} ${c.id}`)) ??
      connectors.find((c) => c.type === "injected") ??
      connectors[0],
    [connectors],
  );
  const effectivePreferredConnector = mounted ? preferredConnector : undefined;
  const connectButtonLabel = mounted
    ? preferredConnector && /rabby/i.test(preferredConnector.name)
      ? "Connect Rabby"
      : "Connect wallet"
    : "Connect wallet";

  const ensureTargetChain = async () => {
    if (chainId !== targetChainId) {
      await switchChainAsync({ chainId: targetChainId });
    }
  };

  const onCreate = async () => {
    setError(null);
    setBusy("create");
    try {
      const body = JSON.parse(formJson) as Record<string, unknown>;
      const { intentId: id } = await createIntent(body);
      setIntentId(id);
      setUserSig(null);
      setMerchantSig(null);
      setReleaseResult(null);
      setReleasePrep(null);
      setReleaseHint(null);
      const row = await getIntent(id);
      setIntent(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onApprove = async () => {
    if (!intent) return;
    setError(null);
    setBusy("approve");
    try {
      await ensureTargetChain();
      const hint = await fundingHint(intent.intentId);
      const escrow = hint.to as `0x${string}`;
      const hash = await writeContractAsync({
        address: intent.asset as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [escrow, BigInt(intent.amountTotal)],
      });
      if (!publicClient) throw new Error("no public client");
      await publicClient.waitForTransactionReceipt({ hash });
      setLastTx(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onDeposit = async () => {
    if (!intent) return;
    setError(null);
    setBusy("deposit");
    try {
      await ensureTargetChain();
      const hint = await fundingHint(intent.intentId);
      const hash = await sendTransactionAsync({
        to: hint.to as `0x${string}`,
        data: hint.data,
      });
      if (!publicClient) throw new Error("no public client");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("deposit reverted");
      await postFundingTx(intent.intentId, hash);
      setLastTx(hash);
      await refreshIntent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onSignUser = async () => {
    if (!intent || !address) {
      setError("Connect wallet and load intent first.");
      return;
    }
    setError(null);
    setReleaseHint(null);
    setBusy("sign-user");
    try {
      await ensureTargetChain();
      if (getAddress(address) !== getAddress(intent.user)) {
        throw new Error(
          `Current wallet must be intent user ${intent.user}. Switch account in your wallet.`,
        );
      }
      const prep = await releasePrepare(intent.intentId);
      const domain = domainFromApi(prep.typedData.domain as Record<string, unknown>);
      const message = releaseMessageFromApi(prep.typedData.message);
      const types = prep.typedData.types as Record<
        string,
        Array<{ name: string; type: string }>
      >;
      const sig = await signTypedDataAsync({
        domain,
        types,
        primaryType: "Release",
        message,
      });
      const recovered = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: "Release",
        message,
        signature: sig,
      });
      if (getAddress(recovered) !== getAddress(intent.user)) {
        throw new Error("userSig did not recover to intent.user");
      }
      setUserSig(sig);
      setMerchantSig(null);
      setReleasePrep(prep);
      const id = intent.intentId.trim();
      const snapshot: StoredReleaseState = {
        userSig: sig,
        merchantSig: null,
        releasePrep: prep,
      };
      if (mounted && id) {
        window.localStorage.setItem(releaseStoreKey(id), JSON.stringify(snapshot));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onSignMerchant = async () => {
    if (!intent || !address) {
      setError("Connect wallet and load intent first.");
      return;
    }
    if (!userSig || !releasePrep) {
      setReleaseHint(
        "Need user signature first. If you opened a new window, paste the same intentId and click Refresh intent.",
      );
      setError("Sign as user first (same prepare payload).");
      return;
    }
    setError(null);
    setReleaseHint(null);
    setBusy("sign-merchant");
    try {
      await ensureTargetChain();
      if (getAddress(address) !== getAddress(intent.merchant)) {
        throw new Error(
          `Current wallet must be merchant ${intent.merchant}. Switch account in your wallet.`,
        );
      }
      const prep = releasePrep;
      const domain = domainFromApi(prep.typedData.domain as Record<string, unknown>);
      const message = releaseMessageFromApi(prep.typedData.message);
      const types = prep.typedData.types as Record<
        string,
        Array<{ name: string; type: string }>
      >;
      const sig = await signTypedDataAsync({
        domain,
        types,
        primaryType: "Release",
        message,
      });
      const recovered = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: "Release",
        message,
        signature: sig,
      });
      if (getAddress(recovered) !== getAddress(intent.merchant)) {
        throw new Error("merchantSig did not recover to intent.merchant");
      }
      setMerchantSig(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onReleaseSubmit = async () => {
    if (!intent || !userSig || !merchantSig) {
      setError("Need both signatures.");
      return;
    }
    setError(null);
    setReleaseHint(null);
    setBusy("submit-release");
    try {
      const res = await releaseSubmit(intent.intentId, userSig, merchantSig);
      setReleaseResult(res);
      await refreshIntent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-6 text-neutral-100">
      <header className="space-y-2 border-b border-neutral-800 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">PayFi demo</h1>
        <p className="text-sm text-neutral-400">
          Next.js + wagmi on target chain (chainId={targetChainId}). API defaults to{" "}
          <code className="rounded bg-neutral-900 px-1">127.0.0.1:8787</code>.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {!effectiveIsConnected ? (
            <button
              type="button"
              disabled={!effectivePreferredConnector || connectPending}
              onClick={() =>
                effectivePreferredConnector &&
                connect({ connector: effectivePreferredConnector })
              }
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {connectPending ? "Connecting…" : connectButtonLabel}
            </button>
          ) : (
            <>
              <span className="font-mono text-xs text-neutral-300">
                {effectiveAddress ?? "—"}
              </span>
              {connector && (
                <span className="text-xs text-neutral-500">
                  via {connector.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-lg border border-neutral-600 px-3 py-1.5 text-sm"
              >
                Disconnect
              </button>
            </>
          )}
          {isConnected && onWrongChain && (
            <button
              type="button"
              disabled={switchPending}
              onClick={() => void switchChainAsync({ chainId: targetChainId })}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Switch to {targetChain.name}
            </button>
          )}
          {effectiveIsConnected && (
            <span className="text-xs text-neutral-500">
              chainId {effectiveChainId} {onWrongChain && `(need ${targetChainId})`}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-medium">Intent</h2>
        <Field label="intentId">
          <input
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm"
            value={intentId}
            onChange={(e) => setIntentId(e.target.value)}
            placeholder="paste or create below"
          />
        </Field>
        <button
          type="button"
          onClick={() => void refreshIntent()}
          className="rounded-lg border border-neutral-600 px-3 py-2 text-sm"
        >
          Refresh intent
        </button>
        {intent && (
          <pre className="max-h-64 overflow-auto rounded bg-neutral-900 p-3 text-xs text-neutral-300">
            {JSON.stringify(intent, null, 2)}
          </pre>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-lg font-medium">1) Create intent (JSON body)</h2>
        <p className="text-xs text-neutral-500">
          Replace addresses with your {targetChain.name} user / merchant / asset. Backend
          must use the same chain (<code>CHAIN_ID={targetChainId}</code>) and escrow.
        </p>
        <textarea
          className="min-h-48 w-full rounded border border-neutral-700 bg-neutral-900 p-3 font-mono text-xs"
          value={formJson}
          onChange={(e) => setFormJson(e.target.value)}
        />
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void onCreate()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "create" ? "Creating…" : "Create intent"}
        </button>
      </section>

      {intent && intent.status === "awaiting_funding" && (
        <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-lg font-medium">2) Fund escrow (user wallet)</h2>
          <p className="text-xs text-neutral-500">
            Connect as <span className="font-mono">{intent.user}</span>, switch to
            target chain, then approve token and send <code>createAndDeposit</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || onWrongChain}
              onClick={() => void onApprove()}
              className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {busy === "approve" ? "Approving…" : "1. Approve ERC20"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || onWrongChain}
              onClick={() => void onDeposit()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "deposit" ? "Depositing…" : "2. createAndDeposit"}
            </button>
          </div>
          {lastTx && (
            <p className="font-mono text-xs text-neutral-400">Last tx: {lastTx}</p>
          )}
        </section>
      )}

      {intent &&
        (intent.status === "active" || intent.status === "partially_settled") && (
          <section className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
            <h2 className="text-lg font-medium">3) Release (dual EIP-712 sign)</h2>
            <div className="rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-300">
              <div>
                connected:{" "}
                <span className="font-mono">{effectiveAddress ?? "not connected"}</span>
              </div>
              <div>
                need user: <span className="font-mono">{intent.user}</span>
              </div>
              <div>
                need merchant: <span className="font-mono">{intent.merchant}</span>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-400">
              <li>
                Connect wallet as <span className="font-mono text-neutral-200">{intent.user}</span> →{" "}
                <strong className="text-neutral-200">Sign as user</strong>.
              </li>
              <li>
                Switch wallet to{" "}
                <span className="font-mono text-neutral-200">{intent.merchant}</span> →{" "}
                <strong className="text-neutral-200">Sign as merchant</strong>.
              </li>
              <li>
                <strong className="text-neutral-200">Submit release</strong> (server relays
                tx with submitter key).
              </li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy) || onWrongChain}
                onClick={() => void onSignUser()}
                className="rounded-lg border border-neutral-600 px-3 py-2 text-sm disabled:opacity-50"
              >
                {busy === "sign-user" ? "Signing…" : "Sign as user"}
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || onWrongChain}
                onClick={() => void onSignMerchant()}
                className="rounded-lg border border-neutral-600 px-3 py-2 text-sm disabled:opacity-50"
              >
                {busy === "sign-merchant" ? "Signing…" : "Sign as merchant"}
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void onReleaseSubmit()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "submit-release" ? "Submitting…" : "Submit release"}
              </button>
            </div>
            <div className="grid gap-2 text-xs font-mono text-neutral-400">
              <span>userSig: {userSig ? `${userSig.slice(0, 18)}…` : "—"}</span>
              <span>
                merchantSig: {merchantSig ? `${merchantSig.slice(0, 18)}…` : "—"}
              </span>
            </div>
            {releaseHint && (
              <div className="rounded border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                {releaseHint}
              </div>
            )}
            {releaseResult && (
              <pre className="overflow-auto rounded bg-neutral-900 p-3 text-xs">
                {JSON.stringify(releaseResult, null, 2)}
              </pre>
            )}
          </section>
        )}
    </main>
  );
}
