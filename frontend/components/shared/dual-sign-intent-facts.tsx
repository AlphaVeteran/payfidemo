"use client";

import type { IntentRecord } from "@/lib/payfi-api";
import { userEscrowRemainder } from "@/lib/intent-balances";

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
  /** 标题栏右侧「刷新合同」按钮文案 */
  refreshContract: string;
};

type Props = {
  intent: IntentRecord;
  labels: DualSignIntentFactsLabels;
  className?: string;
  /** 刷新意向数据（与用户页「刷新合同意向」一致） */
  onRefresh?: () => void | Promise<void>;
};

/**
 * 双签步骤共用的合同意向详情（意向 ID、双方地址、次数、金额、nonce）。
 */
export default function DualSignIntentFacts({ intent, labels, className, onRefresh }: Props) {
  return (
    <section
      className={`payfi-card space-y-3 border border-white/10 bg-zinc-950/40 p-4${className ? ` ${className}` : ""}`}
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
      <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-3 text-xs text-zinc-400">
        <div>
          {labels.contractIntentId}{" "}
          <span className="font-mono text-zinc-300">{intent.intentId}</span>
        </div>
        <div className="mt-1">
          {labels.userAddress}{" "}
          <span className="font-mono text-zinc-300">{intent.user}</span>
        </div>
        <div className="mt-1">
          {labels.merchantAddress}{" "}
          <span className="font-mono text-zinc-300">{intent.merchant}</span>
        </div>
        <div className="mt-1">
          {labels.releaseProgressLabel}{" "}
          <span className="font-mono text-zinc-300">
            {intent.releaseCount}/{intent.maxReleases}
          </span>
        </div>
        <div className="mt-1">
          {labels.escrowTotal}{" "}
          <span className="font-mono text-zinc-300">{intent.amountTotal}</span>
        </div>
        <div className="mt-1">
          {labels.merchantReceived}{" "}
          <span className="font-mono text-zinc-300">{intent.releasedTotal}</span>
        </div>
        <div className="mt-1">
          {labels.userEscrowAmount}{" "}
          <span className="font-mono text-zinc-300">{userEscrowRemainder(intent)}</span>
        </div>
        <div className="mt-1">
          {labels.releaseNonce}{" "}
          <span className="font-mono text-zinc-300">{intent.releaseNonce}</span>
        </div>
      </div>
    </section>
  );
}
