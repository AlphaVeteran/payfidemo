"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PayFiLogo from "@/components/ui/payfi-logo";
import { useI18n } from "@/lib/i18n";
import {
  getSettlementOutboxEvents,
  listIntents,
  type IntentRecord,
  type SettlementOutboxEvent,
} from "@/lib/payfi-api";

type TabKey = "dashboard" | "intents" | "history" | "spend";

function statusText(status: string, locale: "zh-CN" | "zh-TW" | "en") {
  switch (status) {
    case "awaiting_funding":
      return locale === "en" ? "Awaiting Funding" : locale === "zh-TW" ? "待支付" : "待支付";
    case "active":
      return locale === "en" ? "In Escrow" : locale === "zh-TW" ? "託管中" : "托管中";
    case "partially_settled":
      return locale === "en" ? "Partially Settled" : locale === "zh-TW" ? "部分結算" : "部分结算";
    case "settled":
      return locale === "en" ? "Settled" : locale === "zh-TW" ? "已結算" : "已结算";
    case "refunded":
      return locale === "en" ? "Refunded" : locale === "zh-TW" ? "已退款" : "已退款";
    default:
      return status;
  }
}

function toBigIntSafe(v: string) {
  try {
    return BigInt(v);
  } catch {
    return BigInt(0);
  }
}

function amountSummary(intent: IntentRecord) {
  const total = toBigIntSafe(intent.amountTotal);
  const released = toBigIntSafe(intent.releasedTotal);
  return {
    total,
    released,
    locked: total > released ? total - released : BigInt(0),
  };
}

function fmt(n: bigint) {
  return n.toString();
}

export default function MerchantConsole() {
  const { locale } = useI18n();
  const text = {
    "zh-CN": {
      title: "商家",
      console: "控制台",
      subtitle: "合同意向 · 状态 · 历史 · 用户消费",
      home: "首页",
      userSide: "用户端",
      refresh: "刷新",
      refreshing: "刷新中…",
      overview: "总览",
      intents: "合同意向",
      history: "历史",
      spend: "消费",
      pending: "待支付",
      inEscrow: "托管中",
      settledAmount: "已结算金额",
      refundedAmount: "已退款金额",
      allStatus: "全部状态",
      searchPlaceholder: "用户地址或 合同意向编号（intentId）",
      detail: "合同意向详情",
      openDetail: "打开详情页",
      signWorkspace: "进入签名工作台",
      noEvents: "暂无事件，点击右上角刷新。",
      userAddress: "用户地址（完整）",
      totalSpend: "累计消费",
      settled: "已结算",
      locked: "托管中",
      notFoundUser: "未找到该用户记录。",
    },
    "zh-TW": {
      title: "商家",
      console: "控制台",
      subtitle: "合同意向 · 狀態 · 歷史 · 使用者消費",
      home: "首頁",
      userSide: "使用者端",
      refresh: "刷新",
      refreshing: "刷新中…",
      overview: "總覽",
      intents: "合同意向",
      history: "歷史",
      spend: "消費",
      pending: "待支付",
      inEscrow: "託管中",
      settledAmount: "已結算金額",
      refundedAmount: "已退款金額",
      allStatus: "全部狀態",
      searchPlaceholder: "使用者地址或 合同意向編號（intentId）",
      detail: "合同意向詳情",
      openDetail: "開啟詳情頁",
      signWorkspace: "進入簽名工作台",
      noEvents: "暫無事件，點擊右上角刷新。",
      userAddress: "使用者地址（完整）",
      totalSpend: "累計消費",
      settled: "已結算",
      locked: "託管中",
      notFoundUser: "未找到該使用者記錄。",
    },
    en: {
      title: "Merchant",
      console: "Console",
      subtitle: "Contract Intents · Status · History · User Spend",
      home: "Home",
      userSide: "User Side",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      overview: "Overview",
      intents: "Contract Intents",
      history: "History",
      spend: "Spend",
      pending: "Awaiting Funding",
      inEscrow: "In Escrow",
      settledAmount: "Settled Amount",
      refundedAmount: "Refunded Amount",
      allStatus: "All Statuses",
      searchPlaceholder: "User address or Contract Intent ID (intentId)",
      detail: "Contract Intent Details",
      openDetail: "Open Details",
      signWorkspace: "Open Signing Console",
      noEvents: "No events yet. Click Refresh above.",
      userAddress: "User address (full)",
      totalSpend: "Total Spend",
      settled: "Settled",
      locked: "In Escrow",
      notFoundUser: "No records found for this user.",
    },
  }[locale];
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intents, setIntents] = useState<IntentRecord[]>([]);
  const [events, setEvents] = useState<SettlementOutboxEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("");
  const [spendUser, setSpendUser] = useState("");
  const [selectedIntentId, setSelectedIntentId] = useState("");

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, outbox] = await Promise.all([
        listIntents(),
        getSettlementOutboxEvents(),
      ]);
      setIntents(rows.slice().reverse());
      setEvents(outbox.slice().reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const filteredIntents = useMemo(() => {
    return intents.filter((i) => {
      const byStatus = statusFilter === "all" || i.status === statusFilter;
      const byUser =
        !userFilter.trim() ||
        i.user.toLowerCase().includes(userFilter.trim().toLowerCase()) ||
        i.intentId.toLowerCase().includes(userFilter.trim().toLowerCase());
      return byStatus && byUser;
    });
  }, [intents, statusFilter, userFilter]);

  const metrics = useMemo(() => {
    let pending = 0;
    let active = 0;
    let settled = BigInt(0);
    let refunded = BigInt(0);
    for (const i of intents) {
      const amount = toBigIntSafe(i.amountTotal);
      if (i.status === "awaiting_funding") pending += 1;
      if (i.status === "active" || i.status === "partially_settled") active += 1;
      if (i.status === "settled") settled += amount;
      if (i.status === "refunded") refunded += amount;
    }
    return { pending, active, settled, refunded };
  }, [intents]);

  const spendRows = useMemo(() => {
    const key = spendUser.trim().toLowerCase();
    if (!key) return [];
    return intents.filter((i) => i.user.toLowerCase() === key);
  }, [intents, spendUser]);

  const spendSummary = useMemo(() => {
    let total = BigInt(0);
    let released = BigInt(0);
    let refundable = BigInt(0);
    for (const i of spendRows) {
      const s = amountSummary(i);
      total += s.total;
      released += s.released;
      if (i.status === "active" || i.status === "partially_settled") refundable += s.locked;
    }
    return { total, released, refundable };
  }, [spendRows]);

  const selectedIntent = selectedIntentId
    ? intents.find((i) => i.intentId === selectedIntentId) ?? null
    : null;

  useEffect(() => {
    void reload();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6">
      <header className="payfi-card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <PayFiLogo />
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">
              <span className="payfi-title-gradient">{text.title}</span>
              <span className="text-zinc-100"> {text.console}</span>
            </h1>
            <p className="mt-1 text-xs text-zinc-500">{text.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="payfi-link">
            {text.home}
          </Link>
          <Link href="/user" className="payfi-link">
            {text.userSide}
          </Link>
          <button type="button" onClick={() => void reload()} className="payfi-btn-primary text-xs">
            {loading ? text.refreshing : text.refresh}
          </button>
        </div>
      </header>

      {error && <div className="payfi-alert-error">{error}</div>}

      <nav className="payfi-segment flex w-full flex-wrap justify-center sm:justify-start">
        {(
          [
            ["dashboard", text.overview],
            ["intents", text.intents],
            ["history", text.history],
            ["spend", text.spend],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            data-active={tab === k}
            onClick={() => setTab(k as TabKey)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="payfi-card p-4">
            <p className="payfi-label">{text.pending}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">{metrics.pending}</p>
          </div>
          <div className="payfi-card p-4">
            <p className="payfi-label">{text.inEscrow}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">{metrics.active}</p>
          </div>
          <div className="payfi-card p-4">
            <p className="payfi-label">{text.settledAmount}</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sky-300">{fmt(metrics.settled)}</p>
          </div>
          <div className="payfi-card p-4">
            <p className="payfi-label">{text.refundedAmount}</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-violet-300">{fmt(metrics.refunded)}</p>
          </div>
        </section>
      )}

      {tab === "intents" && (
        <section className="payfi-card space-y-4 p-5">
          <div className="flex flex-col gap-2 md:flex-row">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="payfi-select md:max-w-[11rem]"
            >
              <option value="all">{text.allStatus}</option>
              <option value="awaiting_funding">{statusText("awaiting_funding", locale)}</option>
              <option value="active">{statusText("active", locale)}</option>
              <option value="partially_settled">{statusText("partially_settled", locale)}</option>
              <option value="settled">{statusText("settled", locale)}</option>
              <option value="refunded">{statusText("refunded", locale)}</option>
            </select>
            <input
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder={text.searchPlaceholder}
              className="payfi-input flex-1"
            />
          </div>
          <div className="space-y-2">
            {filteredIntents.map((i) => (
              <button
                key={i.intentId}
                type="button"
                onClick={() => setSelectedIntentId(i.intentId)}
                className={`payfi-card-hover w-full rounded-xl border px-3 py-3 text-left transition ${
                  selectedIntentId === i.intentId
                    ? "border-sky-500/40 bg-sky-500/5"
                    : "border-white/8 bg-black/25"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-zinc-300">{i.intentId}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{statusText(i.status, locale)}</span>
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {i.user.slice(0, 10)}… | {i.releasedTotal}/{i.amountTotal}
                </div>
              </button>
            ))}
          </div>
          {selectedIntent && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 text-sm">
              <p className="font-semibold text-zinc-100">{text.detail}</p>
              <p className="mt-2 font-mono text-[11px] text-zinc-400">{selectedIntent.intentId}</p>
              <p className="font-mono text-[11px] text-zinc-400">{selectedIntent.user}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {statusText(selectedIntent.status, locale)} · {selectedIntent.releaseCount}/
                {selectedIntent.maxReleases}
              </p>
              <Link
                href={`/intent/${encodeURIComponent(selectedIntent.intentId)}?role=merchant`}
                className="mt-3 inline-flex payfi-btn-secondary text-xs no-underline"
              >
                {text.openDetail}
              </Link>
              <Link
                href={`/user?intentId=${encodeURIComponent(selectedIntent.intentId)}`}
                className="mt-2 inline-flex payfi-btn-primary text-xs no-underline"
              >
                {text.signWorkspace}
              </Link>
            </div>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="payfi-card space-y-2 p-5">
          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">{text.noEvents}</p>
          ) : (
            events.map((e, idx) => (
              <div
                key={`${e.kind}-${idx}`}
                className="rounded-xl border border-white/6 bg-black/30 p-3"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-zinc-200">{e.kind}</span>
                  <span className="text-[11px] text-zinc-500">{e.createdAt || "-"}</span>
                </div>
                <pre className="mt-2 max-h-40 overflow-auto text-[11px] text-zinc-500">
                  {JSON.stringify(e.payload ?? {}, null, 2)}
                </pre>
              </div>
            ))
          )}
        </section>
      )}

      {tab === "spend" && (
        <section className="payfi-card space-y-4 p-5">
          <input
            value={spendUser}
            onChange={(e) => setSpendUser(e.target.value)}
            placeholder={text.userAddress}
            className="payfi-input font-mono text-xs"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <p className="payfi-label">{text.totalSpend}</p>
              <p className="mt-2 text-lg font-bold text-zinc-100">{fmt(spendSummary.total)}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <p className="payfi-label">{text.settled}</p>
              <p className="mt-2 text-lg font-bold text-sky-300">{fmt(spendSummary.released)}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <p className="payfi-label">{text.locked}</p>
              <p className="mt-2 text-lg font-bold text-violet-300">{fmt(spendSummary.refundable)}</p>
            </div>
          </div>
          <div className="space-y-2">
            {spendRows.map((i) => (
              <div
                key={i.intentId}
                className="rounded-xl border border-white/6 bg-black/25 p-3 text-xs"
              >
                <p className="font-mono text-zinc-300">{i.intentId}</p>
                <p className="mt-1 text-zinc-500">
                  {statusText(i.status, locale)} | {i.releasedTotal}/{i.amountTotal}
                </p>
              </div>
            ))}
            {spendUser && spendRows.length === 0 && (
              <p className="text-sm text-zinc-500">{text.notFoundUser}</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
