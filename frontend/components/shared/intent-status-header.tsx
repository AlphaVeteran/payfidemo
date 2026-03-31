"use client";

type Props = {
  intentId: string;
  status: string;
  onRefresh?: () => void;
};

function statusText(status: string) {
  switch (status) {
    case "awaiting_funding":
      return "待支付";
    case "active":
      return "托管中";
    case "partially_settled":
      return "部分结算";
    case "settled":
      return "已结算";
    case "refunded":
      return "已退款";
    default:
      return status;
  }
}

export default function IntentStatusHeader({ intentId, status, onRefresh }: Props) {
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(intentId);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <div className="payfi-card flex flex-wrap items-center gap-2 p-4">
      <span className="payfi-label shrink-0">intentId</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-300">{intentId}</span>
      <span className="rounded-full border border-violet-500/35 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-violet-200">
        {statusText(status)}
      </span>
      <button type="button" onClick={onCopy} className="payfi-btn-ghost ml-auto text-[11px]">
        复制
      </button>
      {onRefresh && (
        <button type="button" onClick={onRefresh} className="payfi-btn-ghost text-[11px]">
          刷新
        </button>
      )}
    </div>
  );
}
