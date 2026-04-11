"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  getIntent,
  getSettlementOutboxEvents,
  type IntentRecord,
  type SettlementOutboxEvent,
} from "@/lib/payfi-api";
import GatewayReconciliationCard from "@/components/merchant/gateway-reconciliation";
import IntentStatusHeader from "@/components/shared/intent-status-header";
import PayFiLogo from "@/components/ui/payfi-logo";
import { useI18n } from "@/lib/i18n";

type Props = {
  intentId: string;
};

type Role = "user" | "merchant";

function roleFromSearch(v: string | null): Role {
  return v === "merchant" ? "merchant" : "user";
}

export default function IntentDetail({ intentId }: Props) {
  const { locale } = useI18n();
  const params = useSearchParams();
  const text = {
    "zh-CN": {
      title: "托管合同意向",
      detail: "详情",
      perspective: "视角",
      user: "用户",
      merchant: "商家",
      breadcrumbAria: "页面路径",
      breadcrumbHome: "首页",
      breadcrumbUserConsole: "用户工作台",
      breadcrumbMerchantConsole: "商家工作台",
      breadcrumbCurrent: "托管意向详情",
      participants: "参与方",
      partyUser: "用户",
      partyMerchant: "商家",
      partyAsset: "资产",
      amountProgress: "金额与进度",
      released: "已放款",
      releaseProgress: "分期",
      next: "下一步",
      ended: "本合同意向已结束，可在历史 Tab 查看事件。",
      enter: "进入",
      workspace: "工作台",
      paymentHistory: "支付历史",
      loading: "加载中…",
      notFound: "未找到合同意向记录",
      userFundingStep: "在用户工作台完成授权与入金。",
      merchantFundingStep: "等待用户入金后再处理签名。",
      userSignStep: "完成用户签名，再请商家签名并提交链上托管分期放款。",
      merchantSignStep: "确认用户已签后，完成商家签名并提交链上托管分期放款。",
    },
    "zh-TW": {
      title: "託管合同意向",
      detail: "詳情",
      perspective: "視角",
      user: "使用者",
      merchant: "商家",
      breadcrumbAria: "頁面路徑",
      breadcrumbHome: "首頁",
      breadcrumbUserConsole: "使用者工作台",
      breadcrumbMerchantConsole: "商家工作台",
      breadcrumbCurrent: "託管意向詳情",
      participants: "參與方",
      partyUser: "使用者",
      partyMerchant: "商家",
      partyAsset: "資產",
      amountProgress: "金額與進度",
      released: "已放款",
      releaseProgress: "分期",
      next: "下一步",
      ended: "本合同意向已結束，可在歷史 Tab 查看事件。",
      enter: "進入",
      workspace: "工作台",
      paymentHistory: "支付歷史",
      loading: "載入中…",
      notFound: "未找到合同意向記錄",
      userFundingStep: "在使用者工作台完成授權與入金。",
      merchantFundingStep: "等待使用者入金後再處理簽名。",
      userSignStep: "完成使用者簽名，再請商家簽名並提交鏈上託管分期放款。",
      merchantSignStep: "確認使用者已簽後，完成商家簽名並提交鏈上託管分期放款。",
    },
    en: {
      title: "Escrow Contract Intent",
      detail: "Details",
      perspective: "Role",
      user: "User",
      merchant: "Merchant",
      breadcrumbAria: "Breadcrumb",
      breadcrumbHome: "Home",
      breadcrumbUserConsole: "User console",
      breadcrumbMerchantConsole: "Merchant console",
      breadcrumbCurrent: "Intent details",
      participants: "Parties",
      partyUser: "User",
      partyMerchant: "Merchant",
      partyAsset: "Asset",
      amountProgress: "Amount & Progress",
      released: "Disbursed",
      releaseProgress: "Installment",
      next: "Next Steps",
      ended: "This contract intent is completed. See events in History.",
      enter: "Open",
      workspace: "Console",
      paymentHistory: "Payment History",
      noEvents: "No events yet",
      loadingSuffix: "(loading)",
      userFundingStep: "Complete token approval and funding in the user console.",
      merchantFundingStep: "Wait for the user to fund, then proceed to signatures.",
      userSignStep:
        "Sign as user first, then have the merchant sign and submit an on-chain escrow installment disbursement.",
      merchantSignStep:
        "After the user signs, complete the merchant signature and submit installment disbursement.",
      loading: "Loading…",
      notFound: "Contract intent not found",
    },
  }[locale];
  const role = roleFromSearch(params.get("role"));
  const [intent, setIntent] = useState<IntentRecord | null>(null);
  const [events, setEvents] = useState<SettlementOutboxEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [i, outbox] = await Promise.all([
        getIntent(intentId),
        getSettlementOutboxEvents(),
      ]);
      setIntent(i);
      setEvents(outbox);
      window.localStorage.setItem("payfi.lastIntentId", intentId);
      window.localStorage.setItem("payfi.role", role);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentId, role]);

  const timeline = useMemo(() => {
    return events
      .filter((e) => {
        const payloadIntent = e.payload?.intentId;
        return payloadIntent === intentId;
      })
      .reverse();
  }, [events, intentId]);

  const workspaceHref = role === "user" ? "/user" : "/merchant";
  const workspaceLabel =
    role === "user" ? text.breadcrumbUserConsole : text.breadcrumbMerchantConsole;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-4 pb-12 pt-6 sm:px-6">
      <header className="payfi-card space-y-4 p-5">
        <nav
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500"
          aria-label={text.breadcrumbAria}
        >
          <Link
            href="/"
            className="font-medium text-sky-400/95 underline-offset-2 hover:text-sky-300 hover:underline"
          >
            {text.breadcrumbHome}
          </Link>
          <span className="text-zinc-600" aria-hidden>
            /
          </span>
          <Link
            href={workspaceHref}
            className="font-medium text-sky-400/95 underline-offset-2 hover:text-sky-300 hover:underline"
          >
            {workspaceLabel}
          </Link>
          <span className="text-zinc-600" aria-hidden>
            /
          </span>
          <span className="text-zinc-400">{text.breadcrumbCurrent}</span>
        </nav>
        <div className="flex flex-wrap items-start gap-3">
          <PayFiLogo />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="payfi-title-gradient">{text.title}</span>
              <span className="payfi-title-gradient"> {text.detail}</span>
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              {text.perspective}：{role === "user" ? text.user : text.merchant}
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-600 break-all">{intentId}</p>
          </div>
        </div>
      </header>

      {error && <div className="payfi-alert-error">{error}</div>}

      {intent ? (
        <>
          <IntentStatusHeader intentId={intent.intentId} status={intent.status} onRefresh={() => void refresh()} />
          <section className="grid gap-4 md:grid-cols-2">
            <div className="payfi-card space-y-3 p-5">
              <p className="payfi-label">{text.participants}</p>
              <div className="space-y-2 text-[11px]">
                <p className="font-mono text-zinc-400">{text.partyUser} · {intent.user}</p>
                <p className="font-mono text-zinc-400">{text.partyMerchant} · {intent.merchant}</p>
                <p className="font-mono text-zinc-400">{text.partyAsset} · {intent.asset}</p>
              </div>
            </div>
            <div className="payfi-card space-y-3 p-5">
              <p className="payfi-label">{text.amountProgress}</p>
              <p className="text-lg font-bold tabular-nums text-zinc-100">{intent.amountTotal}</p>
              <p className="text-xs text-zinc-500">
                {text.released} <span className="text-sky-300">{intent.releasedTotal}</span>
              </p>
              <p className="text-xs text-zinc-500">
                {text.releaseProgress} {intent.releaseCount}/{intent.maxReleases}
              </p>
            </div>
          </section>

          {role === "merchant" && (
            <section className="payfi-card space-y-3 p-5">
              <GatewayReconciliationCard intent={intent} />
            </section>
          )}

          <section className="payfi-card space-y-3 p-5">
            <p className="text-sm font-semibold text-zinc-200">{text.next}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
              {intent.status === "awaiting_funding" && (
                <li>
                  {role === "user" ? text.userFundingStep : text.merchantFundingStep}
                </li>
              )}
              {(intent.status === "active" || intent.status === "partially_settled") && (
                <li>
                  {role === "user" ? text.userSignStep : text.merchantSignStep}
                </li>
              )}
              {(intent.status === "settled" || intent.status === "refunded") && (
                <li>{text.ended}</li>
              )}
            </ul>
            <Link
              href={role === "user" ? "/user" : "/merchant"}
              className="payfi-btn-primary mt-2 inline-flex w-full justify-center sm:w-auto"
            >
              {text.enter}
              {role === "user" ? text.user : text.merchant}
              {text.workspace}
            </Link>
          </section>

          <section className="payfi-card space-y-3 p-5">
            <p className="text-sm font-semibold text-zinc-200">{text.paymentHistory}</p>
            {timeline.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {locale === "en"
                  ? `${text.noEvents}${loading ? ` ${text.loadingSuffix}` : ""}.`
                  : `暂无事件${loading ? "（加载中）" : ""}。`}
              </p>
            ) : (
              <div className="space-y-2">
                {timeline.map((e, idx) => (
                  <div
                    key={`${e.kind}-${idx}`}
                    className="rounded-xl border border-white/6 bg-black/30 p-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-200">{e.kind}</span>
                      <span className="text-zinc-500">{e.createdAt || "-"}</span>
                    </div>
                    <pre className="mt-2 max-h-36 overflow-auto text-[11px] text-zinc-500">
                      {JSON.stringify(e.payload ?? {}, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="payfi-card px-4 py-6 text-center text-sm text-zinc-500">
          {loading ? text.loading : text.notFound}
        </div>
      )}
    </main>
  );
}
