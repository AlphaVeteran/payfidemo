"use client";

import type { IntentRecord } from "@/lib/payfi-api";
import { userEscrowRemainder } from "@/lib/intent-balances";
import { isPublicUsdcTestnet } from "@/lib/demo-network";
import { demoUsdcDecimals } from "@/lib/token-addresses";
import { formatUnits } from "viem";

export type DualSignIntentFactsLabels = {
  title: string;
  contractIntentId: string;
  userAddress: string;
  merchantAddress: string;
  releaseProgressLabel: string;
  escrowTotal: string;
  merchantReceived: string;
  userEscrowAmount: string;
  releaseNonce: string;
  refreshContract: string;
  userSignRole: string;
  merchantSignRole: string;
  pendingSign: string;
  timeUnknown: string;
  amountsSection: string;
  amountUnitUsdc: string;
  amountUnitMock: string;
};

type Props = {
  intent: IntentRecord;
  labels: DualSignIntentFactsLabels;
  className?: string;
  chainId: number;
  /** 用于签名时间与日期展示 */
  locale: "zh-CN" | "zh-TW" | "en";
  onRefresh?: () => void | Promise<void>;
};

function shortAddr(addr: string, head = 8, tail = 6): string {
  const a = addr.trim();
  if (!a.startsWith("0x") || a.length < 12) return a;
  if (a.length <= 2 + head + tail) return a;
  return `${a.slice(0, 2 + head)}…${a.slice(-tail)}`;
}

function formatWeiHuman(weiStr: string, chainId: number): string {
  try {
    const d = demoUsdcDecimals(chainId);
    return formatUnits(BigInt(weiStr), d);
  } catch {
    return weiStr;
  }
}

function formatSigTime(
  iso: string | undefined,
  locale: "zh-CN" | "zh-TW" | "en",
  timeUnknown: string,
): string {
  if (!iso?.trim()) return timeUnknown;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return timeUnknown;
  const loc = locale === "en" ? "en-US" : locale === "zh-TW" ? "zh-TW" : "zh-CN";
  return new Date(t).toLocaleString(loc, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * 双签步骤共用的合同意向详情：双签时间、编号、地址、USDC/Mock 金额、分期与 nonce。
 */
export default function DualSignIntentFacts({
  intent,
  labels,
  className,
  chainId,
  locale,
  onRefresh,
}: Props) {
  const userSigned = Boolean(intent.userSig?.trim());
  const merchantSigned = Boolean(intent.merchantSig?.trim());

  const totalHuman = formatWeiHuman(intent.amountTotal, chainId);
  const releasedHuman = formatWeiHuman(intent.releasedTotal, chainId);
  const userEscrowRaw = userEscrowRemainder(intent);
  const userEscrowHuman = formatWeiHuman(userEscrowRaw, chainId);

  const unitPrimary = isPublicUsdcTestnet(chainId) ? labels.amountUnitUsdc : labels.amountUnitMock;

  return (
    <section
      className={`payfi-card space-y-4 border border-white/10 bg-zinc-950/40 p-4${className ? ` ${className}` : ""}`}
      aria-labelledby="payfi-intent-facts-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="payfi-intent-facts-heading" className="min-w-0 text-sm font-semibold text-zinc-200">
          {labels.title}
        </h3>
        {onRefresh && (
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="payfi-btn-ghost shrink-0 whitespace-nowrap text-xs"
          >
            {labels.refreshContract}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={
                userSigned ? "h-2 w-2 shrink-0 rounded-full bg-emerald-500/90" : "h-2 w-2 shrink-0 rounded-full bg-zinc-600"
              }
              aria-hidden
            />
            <span className="text-[11px] font-medium text-zinc-300">{labels.userSignRole}</span>
          </div>
          <p className="mt-1.5 tabular-nums text-[11px] leading-snug text-zinc-400">
            {userSigned
              ? formatSigTime(intent.userSigAt, locale, labels.timeUnknown)
              : labels.pendingSign}
          </p>
        </div>
        <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={
                merchantSigned
                  ? "h-2 w-2 shrink-0 rounded-full bg-emerald-500/90"
                  : "h-2 w-2 shrink-0 rounded-full bg-zinc-600"
              }
              aria-hidden
            />
            <span className="text-[11px] font-medium text-zinc-300">{labels.merchantSignRole}</span>
          </div>
          <p className="mt-1.5 tabular-nums text-[11px] leading-snug text-zinc-400">
            {merchantSigned
              ? formatSigTime(intent.merchantSigAt, locale, labels.timeUnknown)
              : labels.pendingSign}
          </p>
        </div>
      </div>

      <div className="space-y-2.5 rounded-xl border border-white/8 bg-black/25 px-3 py-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="text-[11px] text-zinc-500">{labels.contractIntentId}</span>
          <span className="break-all font-mono text-[11px] text-zinc-200" title={intent.intentId}>
            {intent.intentId}
          </span>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="text-[11px] text-zinc-500">{labels.userAddress}</span>
          <span className="break-all font-mono text-[11px] text-zinc-200" title={intent.user}>
            {shortAddr(intent.user)}
          </span>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="text-[11px] text-zinc-500">{labels.merchantAddress}</span>
          <span className="break-all font-mono text-[11px] text-zinc-200" title={intent.merchant}>
            {shortAddr(intent.merchant)}
          </span>
        </div>
      </div>

      <div className="space-y-3 border-t border-white/8 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {labels.amountsSection}
        </p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/6 bg-black/35 px-3 py-2.5">
            <dt className="text-[11px] text-zinc-500">{labels.escrowTotal}</dt>
            <dd className="mt-1 tabular-nums text-base font-semibold tracking-tight text-zinc-100">
              {totalHuman}{" "}
              <span className="text-sm font-medium text-sky-200/90">{unitPrimary}</span>
            </dd>
          </div>
          <div className="rounded-lg border border-white/6 bg-black/35 px-3 py-2.5">
            <dt className="text-[11px] text-zinc-500">{labels.releaseProgressLabel}</dt>
            <dd className="mt-1 tabular-nums text-base font-semibold tracking-tight text-zinc-100">
              {intent.releaseCount} / {intent.maxReleases}
            </dd>
          </div>
          <div className="rounded-lg border border-white/6 bg-black/35 px-3 py-2.5">
            <dt className="text-[11px] text-zinc-500">{labels.merchantReceived}</dt>
            <dd className="mt-1 tabular-nums text-base font-semibold tracking-tight text-zinc-100">
              {releasedHuman}{" "}
              <span className="text-sm font-medium text-sky-200/90">{unitPrimary}</span>
            </dd>
          </div>
          <div className="rounded-lg border border-white/6 bg-black/35 px-3 py-2.5">
            <dt className="text-[11px] text-zinc-500">{labels.userEscrowAmount}</dt>
            <dd className="mt-1 tabular-nums text-base font-semibold tracking-tight text-zinc-100">
              {userEscrowHuman}{" "}
              <span className="text-sm font-medium text-sky-200/90">{unitPrimary}</span>
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-zinc-500">
          {labels.releaseNonce}{" "}
          <span className="font-mono text-zinc-400">{intent.releaseNonce}</span>
        </p>
      </div>
    </section>
  );
}
