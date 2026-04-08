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
      home: "首页",
      homeDesc: "返回角色入口与最近记录",
      switchTo: "切换",
      switchDesc: "切换到另一端查看同一合同意向",
      openCta: "进入 →",
      participants: "参与方",
      partyUser: "用户",
      partyMerchant: "商家",
      partyAsset: "资产",
      amountProgress: "金额与进度",
      released: "已释放",
      releaseProgress: "释放",
      next: "下一步",
      ended: "本合同意向已结束，可在历史 Tab 查看事件。",
      enter: "进入",
      workspace: "工作台",
      paymentHistory: "支付历史",
      loading: "加载中…",
      notFound: "未找到合同意向记录",
    },
    "zh-TW": {
      title: "託管合同意向",
      detail: "詳情",
      perspective: "視角",
      user: "使用者",
      merchant: "商家",
      home: "首頁",
      homeDesc: "返回角色入口與最近記錄",
      switchTo: "切換",
      switchDesc: "切換到另一端查看同一合同意向",
      openCta: "進入 →",
      participants: "參與方",
      partyUser: "使用者",
      partyMerchant: "商家",
      partyAsset: "資產",
      amountProgress: "金額與進度",
      released: "已釋放",
      releaseProgress: "釋放",
      next: "下一步",
      ended: "本合同意向已結束，可在歷史 Tab 查看事件。",
      enter: "進入",
      workspace: "工作台",
      paymentHistory: "支付歷史",
      loading: "載入中…",
      notFound: "未找到合同意向記錄",
    },
    en: {
      title: "Escrow Contract Intent",
      detail: "Details",
      perspective: "Role",
      user: "User",
      merchant: "Merchant",
      home: "Home",
      homeDesc: "Back to role entry and recent records",
      switchTo: "Switch to",
      switchDesc: "Open the same contract intent from the other role",
      openCta: "Open →",
      participants: "Parties",
      partyUser: "User",
      partyMerchant: "Merchant",
      partyAsset: "Asset",
      amountProgress: "Amount & Progress",
      released: "Released",
      releaseProgress: "Releases",
      next: "Next Steps",
      ended: "This contract intent is completed. See events in History.",
      enter: "Open",
      workspace: "Console",
      paymentHistory: "Payment History",
      noEvents: "No events yet",
      loadingSuffix: "(loading)",
      userFundingStep: "Complete token approval and funding in the user console.",
      merchantFundingStep: "Wait for the user to fund, then proceed to signatures.",
      userSignStep: "Sign as user first, then have merchant sign and submit release.",
      merchantSignStep: "After user signs, complete merchant signature and submit release.",
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-4 pb-12 pt-6 sm:px-6">
      <header className="payfi-card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <PayFiLogo />
          <div>
            <h1 className="text-lg font-bold sm:text-xl">
              <span className="payfi-title-gradient">{text.title}</span>
              <span className="text-zinc-100"> {text.detail}</span>
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              {text.perspective}：{role === "user" ? text.user : text.merchant}
            </p>
          </div>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <Link href="/" className="payfi-card payfi-card-hover p-3 text-left no-underline">
            <h2 className="text-xs font-semibold text-zinc-100">{text.home}</h2>
            <p className="mt-1 text-[11px] text-zinc-400">{text.homeDesc}</p>
            <p className="mt-2 text-[11px] font-semibold text-sky-300">{text.openCta}</p>
          </Link>
          <Link
            href={role === "user" ? "/merchant" : "/user"}
            className="payfi-card payfi-card-hover p-3 text-left no-underline"
          >
            <h2 className="text-xs font-semibold text-zinc-100">
              {text.switchTo}
              {role === "user" ? text.merchant : text.user}
            </h2>
            <p className="mt-1 text-[11px] text-zinc-400">{text.switchDesc}</p>
            <p className="mt-2 text-[11px] font-semibold text-violet-300">{text.openCta}</p>
          </Link>
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

          <section className="payfi-card space-y-3 p-5">
            <p className="text-sm font-semibold text-zinc-200">{text.next}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
              {intent.status === "awaiting_funding" && (
                <li>
                  {role === "user"
                    ? locale === "en"
                      ? text.userFundingStep
                      : "在用户工作台完成授权与入金。"
                    : locale === "en"
                      ? text.merchantFundingStep
                      : "等待用户入金后再处理签名。"}
                </li>
              )}
              {(intent.status === "active" || intent.status === "partially_settled") && (
                <li>
                  {role === "user"
                    ? locale === "en"
                      ? text.userSignStep
                      : "完成用户签名，再请商家签名并提交释放。"
                    : locale === "en"
                      ? text.merchantSignStep
                      : "确认用户已签后，完成商家签名并提交释放。"}
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
