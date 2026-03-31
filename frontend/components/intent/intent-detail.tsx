"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getIntent, getOutboxEvents, type IntentRecord, type OutboxEvent } from "@/lib/payfi-api";
import IntentStatusHeader from "@/components/shared/intent-status-header";
import PayFiLogo from "@/components/ui/payfi-logo";

type Props = {
  intentId: string;
};

type Role = "user" | "merchant";

function roleFromSearch(v: string | null): Role {
  return v === "merchant" ? "merchant" : "user";
}

export default function IntentDetail({ intentId }: Props) {
  const params = useSearchParams();
  const role = roleFromSearch(params.get("role"));
  const [intent, setIntent] = useState<IntentRecord | null>(null);
  const [events, setEvents] = useState<OutboxEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [i, outbox] = await Promise.all([getIntent(intentId), getOutboxEvents()]);
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
              <span className="payfi-title-gradient">Intent</span>
              <span className="text-zinc-100"> 详情</span>
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              视角：{role === "user" ? "用户" : "商家"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="payfi-link">
            首页
          </Link>
          <Link href={role === "user" ? "/merchant" : "/user"} className="payfi-link">
            切换{role === "user" ? "商家" : "用户"}
          </Link>
        </div>
      </header>

      {error && <div className="payfi-alert-error">{error}</div>}

      {intent ? (
        <>
          <IntentStatusHeader intentId={intent.intentId} status={intent.status} onRefresh={() => void refresh()} />
          <section className="grid gap-4 md:grid-cols-2">
            <div className="payfi-card space-y-3 p-5">
              <p className="payfi-label">参与方</p>
              <div className="space-y-2 text-[11px]">
                <p className="font-mono text-zinc-400">user · {intent.user}</p>
                <p className="font-mono text-zinc-400">merchant · {intent.merchant}</p>
                <p className="font-mono text-zinc-400">asset · {intent.asset}</p>
              </div>
            </div>
            <div className="payfi-card space-y-3 p-5">
              <p className="payfi-label">金额与进度</p>
              <p className="text-lg font-bold tabular-nums text-zinc-100">{intent.amountTotal}</p>
              <p className="text-xs text-zinc-500">
                已释放 <span className="text-sky-300">{intent.releasedTotal}</span>
              </p>
              <p className="text-xs text-zinc-500">
                释放 {intent.releaseCount}/{intent.maxReleases}
              </p>
            </div>
          </section>

          <section className="payfi-card space-y-3 p-5">
            <p className="text-sm font-semibold text-zinc-200">下一步</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
              {intent.status === "awaiting_funding" && (
                <li>
                  {role === "user"
                    ? "在用户工作台完成授权与入金。"
                    : "等待用户入金后再处理签名。"}
                </li>
              )}
              {(intent.status === "active" || intent.status === "partially_settled") && (
                <li>
                  {role === "user"
                    ? "完成用户签名，再请商家签名并提交释放。"
                    : "确认用户已签后，完成商家签名并提交释放。"}
                </li>
              )}
              {(intent.status === "settled" || intent.status === "refunded") && (
                <li>本意图已结束，可在历史 Tab 查看事件。</li>
              )}
            </ul>
            <Link
              href={role === "user" ? "/user" : "/merchant"}
              className="payfi-btn-primary mt-2 inline-flex w-full justify-center sm:w-auto"
            >
              进入{role === "user" ? "用户" : "商家"}工作台
            </Link>
          </section>

          <section className="payfi-card space-y-3 p-5">
            <p className="text-sm font-semibold text-zinc-200">支付历史</p>
            {timeline.length === 0 ? (
              <p className="text-sm text-zinc-500">
                暂无事件{loading ? "（加载中）" : ""}。
              </p>
            ) : (
              <div className="space-y-2">
                {timeline.map((e, idx) => (
                  <div
                    key={`${e.type}-${idx}`}
                    className="rounded-xl border border-white/6 bg-black/30 p-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-200">{e.type}</span>
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
          {loading ? "加载中…" : "未找到 intent"}
        </div>
      )}
    </main>
  );
}
