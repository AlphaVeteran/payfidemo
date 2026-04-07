"use client";

import { useI18n } from "@/lib/i18n";

type Props = {
  intentId: string;
  status: string;
  onRefresh?: () => void;
};

function statusText(status: string) {
  const lang = (typeof document !== "undefined" ? document.documentElement.lang : "zh-CN") as
    | "zh-CN"
    | "zh-TW"
    | "en";
  switch (status) {
    case "awaiting_funding":
      return lang === "en" ? "Awaiting Funding" : "待支付";
    case "active":
      return lang === "en" ? "In Escrow" : lang === "zh-TW" ? "託管中" : "托管中";
    case "partially_settled":
      return lang === "en" ? "Partially Settled" : lang === "zh-TW" ? "部分結算" : "部分结算";
    case "settled":
      return lang === "en" ? "Settled" : lang === "zh-TW" ? "已結算" : "已结算";
    case "refunded":
      return lang === "en" ? "Refunded" : "已退款";
    default:
      return status;
  }
}

export default function IntentStatusHeader({ intentId, status, onRefresh }: Props) {
  const { locale } = useI18n();
  const text = {
    "zh-CN": { idLabel: "合同意向编号（intentId）", copy: "复制", refresh: "刷新" },
    "zh-TW": { idLabel: "合同意向編號（intentId）", copy: "複製", refresh: "刷新" },
    en: { idLabel: "Contract Intent ID (intentId)", copy: "Copy", refresh: "Refresh" },
  }[locale];
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(intentId);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <div className="payfi-card flex flex-wrap items-center gap-2 p-4">
      <span className="payfi-label shrink-0">{text.idLabel}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-300">{intentId}</span>
      <span className="rounded-full border border-violet-500/35 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-violet-200">
        {statusText(status)}
      </span>
      <button type="button" onClick={onCopy} className="payfi-btn-ghost ml-auto text-[11px]">
        {text.copy}
      </button>
      {onRefresh && (
        <button type="button" onClick={onRefresh} className="payfi-btn-ghost text-[11px]">
          {text.refresh}
        </button>
      )}
    </div>
  );
}
