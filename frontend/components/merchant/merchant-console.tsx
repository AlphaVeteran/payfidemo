"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PayFiLogo from "@/components/ui/payfi-logo";
import {
  getSettlementOutboxEvents,
  listIntents,
  type IntentRecord,
  type SettlementOutboxEvent,
} from "@/lib/payfi-api";

type TabKey = "dashboard" | "intents" | "history" | "spend";

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

function toBigIntSafe(v: string) {
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

function amountSummary(intent: IntentRecord) {
  const total = toBigIntSafe(intent.amountTotal);
  const released = toBigIntSafe(intent.releasedTotal);
  return {
    total,
    released,
    locked: total > released ? total - released : 0n,
  };
}

function fmt(n: bigint) {
  return n.toString();
}

export default function MerchantConsole() {
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
    let settled = 0n;
    let refunded = 0n;
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
    let total = 0n;
    let released = 0n;
    let refundable = 0n;
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
              <span className="payfi-title-gradient">商家</span>
              <span className="text-zinc-100"> 控制台</span>
            </h1>
            <p className="mt-1 text-xs text-zinc-500">意图 · 状态 · 历史 · 用户消费</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="payfi-link">
            首页
          </Link>
          <Link href="/user" className="payfi-link">
            用户端
          </Link>
          <button type="button" onClick={() => void reload()} className="payfi-btn-primary text-xs">
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>
      </header>

      {error && <div className="payfi-alert-error">{error}</div>}

      <nav className="payfi-segment flex w-full flex-wrap justify-center sm:justify-start">
        {(
          [
            ["dashboard", "总览"],
            ["intents", "意图"],
            ["history", "历史"],
            ["spend", "消费"],
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
            <p className="payfi-label">待支付</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">{metrics.pending}</p>
          </div>
          <div className="payfi-card p-4">
            <p className="payfi-label">托管中</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">{metrics.active}</p>
          </div>
          <div className="payfi-card p-4">
            <p className="payfi-label">已结算金额</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sky-300">{fmt(metrics.settled)}</p>
          </div>
          <div className="payfi-card p-4">
            <p className="payfi-label">已退款金额</p>
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
              <option value="all">全部状态</option>
              <option value="awaiting_funding">待支付</option>
              <option value="active">托管中</option>
              <option value="partially_settled">部分结算</option>
              <option value="settled">已结算</option>
              <option value="refunded">已退款</option>
            </select>
            <input
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="用户地址或 intentId"
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
                  <span className="shrink-0 text-xs text-zinc-500">{statusText(i.status)}</span>
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {i.user.slice(0, 10)}… | {i.releasedTotal}/{i.amountTotal}
                </div>
              </button>
            ))}
          </div>
          {selectedIntent && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 text-sm">
              <p className="font-semibold text-zinc-100">意图详情</p>
              <p className="mt-2 font-mono text-[11px] text-zinc-400">{selectedIntent.intentId}</p>
              <p className="font-mono text-[11px] text-zinc-400">{selectedIntent.user}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {statusText(selectedIntent.status)} · {selectedIntent.releaseCount}/
                {selectedIntent.maxReleases}
              </p>
              <Link
                href={`/intent/${encodeURIComponent(selectedIntent.intentId)}?role=merchant`}
                className="mt-3 inline-flex payfi-btn-secondary text-xs no-underline"
              >
                打开详情页
              </Link>
              <Link
                href={`/user?intentId=${encodeURIComponent(selectedIntent.intentId)}`}
                className="mt-2 inline-flex payfi-btn-primary text-xs no-underline"
              >
                进入签名工作台
              </Link>
            </div>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="payfi-card space-y-2 p-5">
          {events.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无事件，点击右上角刷新。</p>
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
            placeholder="用户地址（完整）"
            className="payfi-input font-mono text-xs"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <p className="payfi-label">累计消费</p>
              <p className="mt-2 text-lg font-bold text-zinc-100">{fmt(spendSummary.total)}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <p className="payfi-label">已结算</p>
              <p className="mt-2 text-lg font-bold text-sky-300">{fmt(spendSummary.released)}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-4">
              <p className="payfi-label">托管中</p>
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
                  {statusText(i.status)} | {i.releasedTotal}/{i.amountTotal}
                </p>
              </div>
            ))}
            {spendUser && spendRows.length === 0 && (
              <p className="text-sm text-zinc-500">未找到该用户记录。</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
