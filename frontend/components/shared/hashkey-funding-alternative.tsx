"use client";

type Labels = {
  eitherOrNote: string;
  cardTitle: string;
  gatewayTitle: string;
  gatewayOpen: string;
  noPaymentUrl: string;
  registerTitle: string;
  registerHint: string;
  registerPlaceholder: string;
  registerSubmit: string;
  registerBusy: string;
};

type Props = {
  paymentUrl?: string | null;
  registerTxValue: string;
  onRegisterTxChange: (value: string) => void;
  onRegisterSubmit: () => void | Promise<void>;
  /** e.g. "register-tx" when submitting */
  busy: string | null;
  labels: Labels;
};

/**
 * HashKey 收银台链接 + 支付后登记交易哈希，与「授权代币 + 存入托管」二选一。
 */
export default function HashkeyFundingAlternative({
  paymentUrl,
  registerTxValue,
  onRegisterTxChange,
  onRegisterSubmit,
  busy,
  labels,
}: Props) {
  const registering = busy === "register-tx";

  return (
    <div className="mt-4 space-y-3">
      <p className="border-t border-white/10 pt-3 text-center text-[11px] leading-relaxed text-zinc-500">
        {labels.eitherOrNote}
      </p>
      <div className="rounded-xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.08] to-emerald-500/[0.06] p-4">
        <p className="text-sm font-semibold text-zinc-100">{labels.cardTitle}</p>

        <div className="mt-4 space-y-2">
          <p className="payfi-label text-[10px]">{labels.gatewayTitle}</p>
          {paymentUrl?.trim() ? (
            <a
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={Boolean(busy)}
              tabIndex={busy ? -1 : undefined}
              className={`payfi-btn-primary inline-flex text-center no-underline ${
                busy ? "pointer-events-none opacity-45" : ""
              }`}
            >
              {labels.gatewayOpen}
            </a>
          ) : (
            <p className="text-xs text-zinc-500">{labels.noPaymentUrl}</p>
          )}
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-sm font-medium text-emerald-100/90">{labels.registerTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{labels.registerHint}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="payfi-input min-h-[40px] flex-1 font-mono text-xs"
              placeholder={labels.registerPlaceholder}
              value={registerTxValue}
              onChange={(e) => onRegisterTxChange(e.target.value)}
            />
            <button
              type="button"
              disabled={Boolean(busy) || !registerTxValue.trim()}
              onClick={() => void onRegisterSubmit()}
              className="payfi-btn-secondary shrink-0 whitespace-nowrap"
            >
              {registering ? labels.registerBusy : labels.registerSubmit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
