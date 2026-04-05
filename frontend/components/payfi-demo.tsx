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
import { useSearchParams } from "next/navigation";
import {
  erc20Abi,
  getAddress,
  parseUnits,
  recoverTypedDataAddress,
  type PublicClient,
} from "viem";
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
import { baseSepolia } from "wagmi/chains";
import {
  BASE_SEPOLIA_USDC_DECIMALS,
  defaultDemoAssetAddress,
} from "@/lib/token-addresses";

/** Anvil + Rabby：RPC/链不一致或重启链后，旧 tx 会表现为长时间等不到回执。 */
async function waitTxReceipt(client: PublicClient, hash: `0x${string}`) {
  try {
    return await client.waitForTransactionReceipt({
      hash,
      timeout: 180_000,
      pollingInterval: 400,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timed out|Timed out|timeout/i.test(msg)) {
      throw new Error(
        `${msg} · 请检查：1) Rabby 与前端同一 RPC（页面用 ${targetChainId}，常见 http://127.0.0.1:8545）；2) 若刚执行过 reset-local-dev，请重新授权；3) 终端验证：cast receipt ${hash} --rpc-url http://127.0.0.1:8545`,
      );
    }
    throw e;
  }
}

function sepoliaUsdcToIntentAmounts(
  usdcDecimalStr: string,
  maxReleases: number,
): { amountTotal: string; amountPerLesson: string } {
  if (!Number.isInteger(maxReleases) || maxReleases < 1) {
    throw new Error("最大释放次数须为 ≥1 的整数。");
  }
  const trimmed = usdcDecimalStr.trim();
  if (!trimmed) {
    throw new Error("请输入托管总额（USDC）。");
  }
  let total: bigint;
  try {
    total = parseUnits(trimmed, BASE_SEPOLIA_USDC_DECIMALS);
  } catch {
    throw new Error("USDC 金额格式无效（示例：1000 或 0.5）。");
  }
  if (total <= BigInt(0)) {
    throw new Error("托管总额须大于 0。");
  }
  const mr = BigInt(maxReleases);
  if (total % mr !== BigInt(0)) {
    throw new Error(
      `总额按最小单位须能被 ${maxReleases} 整除（均分每节）。请调整金额或「最大释放次数」。`,
    );
  }
  const per = total / mr;
  return { amountTotal: total.toString(), amountPerLesson: per.toString() };
}

const defaultCreateBodyStatic = {
  merchant: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  /** Anvil Mock 18 decimals；Base Sepolia 创建时使用用户输入 USDC，不经此默认值 */
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
    <label className="flex flex-col gap-2">
      <span className="payfi-label">{label}</span>
      {children}
    </label>
  );
}

export default function PayFiDemo() {
  const searchParams = useSearchParams();
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

  const defaultCreateBody = {
    ...defaultCreateBodyStatic,
    asset: defaultDemoAssetAddress(targetChainId),
  };

  const [intentId, setIntentId] = useState("");
  const [intent, setIntent] = useState<IntentRecord | null>(null);
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
  const [sepoliaTotalUsdc, setSepoliaTotalUsdc] = useState("1000");
  const [sepoliaMaxReleases, setSepoliaMaxReleases] = useState("10");

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
    const fromQuery = searchParams.get("intentId")?.trim();
    if (fromQuery) {
      setIntentId(fromQuery);
    }
  }, [searchParams]);

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
      let body: Record<string, unknown> = { ...defaultCreateBody };
      if (targetChainId === baseSepolia.id) {
        if (!address) {
          throw new Error("Base Sepolia 请先连接钱包（将作为 intent user）。");
        }
        const maxRel = Number.parseInt(sepoliaMaxReleases, 10);
        const { amountTotal, amountPerLesson } = sepoliaUsdcToIntentAmounts(
          sepoliaTotalUsdc,
          maxRel,
        );
        body = {
          ...body,
          user: getAddress(address),
          amountTotal,
          amountPerLesson,
          maxReleases: maxRel,
        };
        const dm = process.env.NEXT_PUBLIC_DEMO_MERCHANT?.trim();
        if (dm) {
          body = { ...body, merchant: getAddress(dm as `0x${string}`) };
        }
      }
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
      const receipt = await waitTxReceipt(publicClient, hash);
      if (receipt.status !== "success") throw new Error("approve reverted");
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
      const receipt = await waitTxReceipt(publicClient, hash);
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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6">
      <header className="payfi-card space-y-4 p-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            <span className="payfi-title-gradient">PayFi</span>
            <span className="text-zinc-100"> 用户工作台</span>
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            chainId {targetChainId} · API{" "}
            <span className="payfi-code">127.0.0.1:8787</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!effectiveIsConnected ? (
            <button
              type="button"
              disabled={!effectivePreferredConnector || connectPending}
              onClick={() =>
                effectivePreferredConnector &&
                connect({ connector: effectivePreferredConnector })
              }
              className="payfi-btn-primary"
            >
              {connectPending ? "连接中…" : connectButtonLabel}
            </button>
          ) : (
            <>
              <span className="font-mono text-[11px] text-zinc-300">
                {effectiveAddress ?? "—"}
              </span>
              {connector && (
                <span className="text-[11px] text-zinc-500">· {connector.name}</span>
              )}
              <button type="button" onClick={() => disconnect()} className="payfi-btn-ghost">
                断开
              </button>
            </>
          )}
          {isConnected && onWrongChain && (
            <button
              type="button"
              disabled={switchPending}
              onClick={() => void switchChainAsync({ chainId: targetChainId })}
              className="payfi-btn-secondary"
            >
              切换到 {targetChain.name}
            </button>
          )}
          {effectiveIsConnected && (
            <span className="text-[11px] text-zinc-500">
              {effectiveChainId}
              {onWrongChain && ` → 需 ${targetChainId}`}
            </span>
          )}
        </div>
      </header>

      {error && <div className="payfi-alert-error">{error}</div>}

      <section className="payfi-card space-y-4 p-5">
        <h2 className="text-base font-semibold text-zinc-100">1) 创建意图</h2>
        {targetChainId === baseSepolia.id && (
          <>
            <p className="text-xs leading-relaxed text-zinc-500">
              使用 Circle Base Sepolia USDC{" "}
              <span className="font-mono text-zinc-400">{defaultCreateBody.asset}</span>
              （{BASE_SEPOLIA_USDC_DECIMALS} decimals）。总额将均分为「最大释放次数」笔；商家地址可通过{" "}
              <span className="font-mono text-zinc-400">NEXT_PUBLIC_DEMO_MERCHANT</span>{" "}
              配置；未配置时仍为 Anvil 演示商家地址（双签需对应私钥）。
            </p>
            <Field label="托管总额（USDC）">
              <input
                className="payfi-input font-mono text-sm"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={sepoliaTotalUsdc}
                onChange={(e) => setSepoliaTotalUsdc(e.target.value)}
                placeholder="例如 1000 或 0.5"
              />
            </Field>
            <Field label="最大释放次数（均分总额，须整除）">
              <input
                className="payfi-input w-full max-w-[12rem] font-mono text-sm"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={sepoliaMaxReleases}
                onChange={(e) => setSepoliaMaxReleases(e.target.value.replace(/\D/g, "") || "1")}
              />
            </Field>
          </>
        )}
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void onCreate()}
          className="payfi-btn-primary w-full sm:w-auto"
        >
          {busy === "create" ? "创建中…" : "创建意图"}
        </button>
        <Field label="intentId">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="payfi-input flex-1 font-mono text-xs"
              value={intentId}
              onChange={(e) => setIntentId(e.target.value)}
              placeholder="创建成功后自动填入，或手动粘贴"
            />
            <button
              type="button"
              onClick={() => void refreshIntent()}
              className="payfi-btn-ghost whitespace-nowrap"
            >
              刷新意图
            </button>
          </div>
        </Field>
        {intent && (
          <pre className="max-h-64 overflow-auto rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-zinc-400">
            {JSON.stringify(intent, null, 2)}
          </pre>
        )}
      </section>

      {intent && intent.status === "awaiting_funding" && (
        <section className="payfi-card space-y-4 p-5">
          <h2 className="text-base font-semibold text-zinc-100">2) 资金托管</h2>
          <p className="text-xs text-zinc-500">
            使用 <span className="font-mono text-zinc-400">{intent.user}</span> 连接钱包并切换网络，然后授权并入金。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || onWrongChain}
              onClick={() => void onApprove()}
              className="payfi-btn-secondary"
            >
              {busy === "approve" ? "授权中…" : "1. 授权代币"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || onWrongChain}
              onClick={() => void onDeposit()}
              className="payfi-btn-primary"
            >
              {busy === "deposit" ? "入金中…" : "2. 存入托管"}
            </button>
          </div>
          {lastTx && (
            <p className="font-mono text-[11px] text-zinc-500">Last tx: {lastTx}</p>
          )}
        </section>
      )}

      {intent &&
        (intent.status === "active" || intent.status === "partially_settled") && (
          <section className="payfi-card space-y-4 p-5">
            <h2 className="text-base font-semibold text-zinc-100">3) 双签释放</h2>
            <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-3 text-xs text-zinc-400">
              <div>
                当前钱包{" "}
                <span className="font-mono text-zinc-300">{effectiveAddress ?? "未连接"}</span>
              </div>
              <div className="mt-1">
                需用户 <span className="font-mono text-zinc-300">{intent.user}</span>
              </div>
              <div className="mt-1">
                需商家 <span className="font-mono text-zinc-300">{intent.merchant}</span>
              </div>
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-400">
              <li>
                用户钱包签名 <strong className="text-zinc-200">Sign as user</strong>
              </li>
              <li>
                切换商家钱包 <strong className="text-zinc-200">Sign as merchant</strong>
              </li>
              <li>
                <strong className="text-zinc-200">提交释放</strong>（服务端代发交易）
              </li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy) || onWrongChain}
                onClick={() => void onSignUser()}
                className="payfi-btn-secondary"
              >
                {busy === "sign-user" ? "签名中…" : "用户签名"}
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || onWrongChain}
                onClick={() => void onSignMerchant()}
                className="payfi-btn-secondary"
              >
                {busy === "sign-merchant" ? "签名中…" : "商家签名"}
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void onReleaseSubmit()}
                className="payfi-btn-primary"
              >
                {busy === "submit-release" ? "提交中…" : "提交释放"}
              </button>
            </div>
            <div className="grid gap-2 font-mono text-[11px] text-zinc-500">
              <span>userSig: {userSig ? `${userSig.slice(0, 18)}…` : "—"}</span>
              <span>
                merchantSig: {merchantSig ? `${merchantSig.slice(0, 18)}…` : "—"}
              </span>
            </div>
            {releaseHint && <div className="payfi-alert-warn">{releaseHint}</div>}
            {releaseResult && (
              <pre className="overflow-auto rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-zinc-400">
                {JSON.stringify(releaseResult, null, 2)}
              </pre>
            )}
          </section>
        )}
    </main>
  );
}
