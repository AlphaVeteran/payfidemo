"use client";

import { useState } from "react";
import {
  getGatewayReconciliation,
  type GatewayReconciliationResponse,
  type IntentRecord,
} from "@/lib/payfi-api";
import { useI18n } from "@/lib/i18n";

type Props = {
  intent: IntentRecord;
};

export default function GatewayReconciliationCard({ intent }: Props) {
  const { locale } = useI18n();
  const text = {
    "zh-CN": {
      title: "HSP / 网关双源对账",
      subtitle: "调用 HashKey Merchant API（GET /merchant/payments）与本地托管状态、链上交易对照。",
      cta: "查询网关支付状态",
      loading: "查询中…",
      noHsk: "该意向无网关订单号（未走 HashKey reusable 创建或创建失败）。",
      gatewayStatus: "网关状态",
      localStatus: "本地 intent 状态",
      gatewayTx: "网关 tx_signature",
      localTx: "本地 fundingTxHash",
      match: "交易哈希一致",
      mismatch: "交易哈希不一致或仅一侧有值（路径不同属正常）",
      unknown: "无法对比（缺一侧哈希）",
      none: "—",
      raw: "网关返回（摘要）",
      doc: "手册：hashfans.io → HSP → Merchant Docs",
    },
    "zh-TW": {
      title: "HSP / 網關雙源對帳",
      subtitle: "呼叫 HashKey Merchant API（GET /merchant/payments）與本地託管狀態、鏈上交易對照。",
      cta: "查詢網關支付狀態",
      loading: "查詢中…",
      noHsk: "該意向無網關訂單號（未走 HashKey reusable 建立或建立失敗）。",
      gatewayStatus: "網關狀態",
      localStatus: "本地 intent 狀態",
      gatewayTx: "網關 tx_signature",
      localTx: "本地 fundingTxHash",
      match: "交易雜湊一致",
      mismatch: "交易雜湊不一致或僅一側有值（路徑不同屬正常）",
      unknown: "無法對比（缺一側雜湊）",
      none: "—",
      raw: "網關返回（摘要）",
      doc: "手冊：hashfans.io → HSP → Merchant Docs",
    },
    en: {
      title: "HSP / gateway dual-source reconciliation",
      subtitle:
        "Calls HashKey Merchant API (GET /merchant/payments) vs local escrow intent and on-chain tx.",
      cta: "Query gateway payment status",
      loading: "Querying…",
      noHsk: "No gateway order ids (intent was not created via HashKey reusable or creation failed).",
      gatewayStatus: "Gateway status",
      localStatus: "Local intent status",
      gatewayTx: "Gateway tx_signature",
      localTx: "Local fundingTxHash",
      match: "Tx hash match",
      mismatch: "Mismatch or one side empty (normal if flows differ)",
      unknown: "Cannot compare (missing one hash)",
      none: "—",
      raw: "Gateway response (summary)",
      doc: "Manual: hashfans.io → HSP → Merchant Docs",
    },
  }[locale];

  const hasHsk = Boolean(intent.hskCartMandateId?.trim() || intent.hskPaymentReqId?.trim());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GatewayReconciliationResponse | null>(null);

  const onQuery = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getGatewayReconciliation(intent.intentId);
      setData(r);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!hasHsk) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-xs text-zinc-500">
        {text.noHsk}
      </div>
    );
  }

  const primary = data?.gateway?.primary as Record<string, unknown> | null | undefined;
  const status =
    typeof primary?.status === "string" ? primary.status : (text.none as string);

  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-4">
      <div>
        <p className="text-sm font-semibold text-emerald-100/95">{text.title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{text.subtitle}</p>
        <p className="mt-1 text-[10px] text-zinc-600">{text.doc}</p>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={() => void onQuery()}
        className="payfi-btn-secondary text-xs"
      >
        {loading ? text.loading : text.cta}
      </button>
      {error && <div className="payfi-alert-error text-xs">{error}</div>}
      {data && (
        <div className="space-y-2 text-xs text-zinc-300">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/8 bg-black/35 px-2 py-2">
              <p className="payfi-label text-[10px]">{text.gatewayStatus}</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-200">{status}</p>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/35 px-2 py-2">
              <p className="payfi-label text-[10px]">{text.localStatus}</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-200">{data.local.status}</p>
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-black/35 px-2 py-2">
            <p className="payfi-label text-[10px]">{text.gatewayTx}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-zinc-400">
              {data.reconciliation.gatewayTxSignature ?? text.none}
            </p>
            {data.reconciliation.explorerGatewayTxUrl && (
              <a
                href={data.reconciliation.explorerGatewayTxUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-sky-400 underline-offset-2 hover:underline"
              >
                Blockscout →
              </a>
            )}
          </div>
          <div className="rounded-lg border border-white/8 bg-black/35 px-2 py-2">
            <p className="payfi-label text-[10px]">{text.localTx}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-zinc-400">
              {data.reconciliation.localFundingTxHash ?? text.none}
            </p>
            {data.reconciliation.explorerLocalTxUrl && (
              <a
                href={data.reconciliation.explorerLocalTxUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-sky-400 underline-offset-2 hover:underline"
              >
                Blockscout →
              </a>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">
            {data.reconciliation.txMatch === true
              ? `✓ ${text.match}`
              : data.reconciliation.txMatch === false
                ? text.mismatch
                : text.unknown}
          </p>
          <div>
            <p className="payfi-label text-[10px]">{text.raw}</p>
            <pre className="mt-1 max-h-36 overflow-auto rounded border border-white/6 bg-black/40 p-2 text-[10px] text-zinc-500">
              {JSON.stringify(primary ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
