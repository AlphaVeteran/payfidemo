"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { listIntents, type IntentRecord } from "@/lib/payfi-api";
import PayFiLogo from "@/components/ui/payfi-logo";

type Role = "user" | "merchant";

const roleStorageKey = "payfi.role";
const recentStorageKey = "payfi.lastIntentId";

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

export default function RoleEntry() {
  const router = useRouter();
  const [intentIdInput, setIntentIdInput] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [recent, setRecent] = useState<IntentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cachedRole = window.localStorage.getItem(roleStorageKey);
    if (cachedRole === "user" || cachedRole === "merchant") {
      setRole(cachedRole);
    }
    const last = window.localStorage.getItem(recentStorageKey);
    if (last) setIntentIdInput(last);
    void (async () => {
      try {
        const rows = await listIntents();
        setRecent(rows.slice(-5).reverse());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const gotoRole = (nextRole: Role) => {
    window.localStorage.setItem(roleStorageKey, nextRole);
    setRole(nextRole);
    router.push(`/${nextRole}`);
  };

  const continueHref = useMemo(() => {
    const id = intentIdInput.trim();
    if (!id) return null;
    return `/intent/${encodeURIComponent(id)}?role=${role}`;
  }, [intentIdInput, role]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-8 px-4 pb-12 pt-8 sm:max-w-xl sm:px-6">
      <header className="flex items-start gap-4">
        <PayFiLogo />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="payfi-title-gradient">PayFi</span>
            <span className="text-zinc-100"> Demo</span>
          </h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            选择角色进入流程，或通过 intentId 继续上次操作。
          </p>
        </div>
      </header>

      <div className="payfi-segment w-full justify-center sm:w-auto">
        <button
          type="button"
          data-active={role === "user"}
          onClick={() => {
            setRole("user");
            window.localStorage.setItem(roleStorageKey, "user");
          }}
        >
          用户
        </button>
        <button
          type="button"
          data-active={role === "merchant"}
          onClick={() => {
            setRole("merchant");
            window.localStorage.setItem(roleStorageKey, "merchant");
          }}
        >
          商家
        </button>
      </div>

      <section className="grid gap-4">
        <button
          type="button"
          onClick={() => gotoRole("user")}
          className="payfi-card payfi-card-hover p-5 text-left"
        >
          <h2 className="text-lg font-semibold text-zinc-100">我是用户</h2>
          <p className="mt-1 text-sm text-zinc-400">支付并跟踪托管与结算进度</p>
          <p className="mt-4 text-xs font-semibold text-sky-400">进入用户工作台 →</p>
        </button>
        <button
          type="button"
          onClick={() => gotoRole("merchant")}
          className="payfi-card payfi-card-hover p-5 text-left"
        >
          <h2 className="text-lg font-semibold text-zinc-100">我是商家</h2>
          <p className="mt-1 text-sm text-zinc-400">查看意图、状态、历史与用户消费</p>
          <p className="mt-4 text-xs font-semibold text-violet-300">进入商家控制台 →</p>
        </button>
      </section>

      <section className="payfi-card space-y-4 p-5">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-300">继续上次流程</h3>
        <div className="flex flex-col gap-3">
          <input
            value={intentIdInput}
            onChange={(e) => setIntentIdInput(e.target.value)}
            placeholder="输入 intentId"
            className="payfi-input font-mono text-xs"
          />
          {continueHref ? (
            <Link
              href={continueHref}
              onClick={() => window.localStorage.setItem(recentStorageKey, intentIdInput.trim())}
              className="payfi-btn-primary w-full text-center no-underline"
            >
              继续
            </Link>
          ) : (
            <button type="button" disabled className="payfi-btn-primary w-full">
              继续
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500">将以「{role === "user" ? "用户" : "商家"}」视角打开详情</p>
      </section>

      <section className="payfi-card space-y-3 p-5">
        <h3 className="text-sm font-semibold text-zinc-300">最近记录</h3>
        {error && <p className="text-xs text-amber-200/90">{error}</p>}
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">暂无记录</p>
        ) : (
          <div className="space-y-2">
            {recent.map((item) => (
              <Link
                key={item.intentId}
                href={`/intent/${encodeURIComponent(item.intentId)}?role=${role}`}
                onClick={() => window.localStorage.setItem(recentStorageKey, item.intentId)}
                className="payfi-card payfi-card-hover flex items-center justify-between gap-2 px-3 py-2.5 no-underline"
              >
                <span className="truncate font-mono text-[11px] text-zinc-300">{item.intentId}</span>
                <span className="shrink-0 text-xs text-zinc-500">{statusText(item.status)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
