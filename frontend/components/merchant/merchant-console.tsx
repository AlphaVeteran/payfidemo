"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import GatewayReconciliationCard from "@/components/merchant/gateway-reconciliation";
import MerchantReleasePanel from "@/components/merchant/merchant-release-panel";
import PayFiLogo from "@/components/ui/payfi-logo";
import { useI18n } from "@/lib/i18n";
import { HASHKEY_TESTNET_CHAIN_ID } from "@/lib/demo-network";
import { targetChain, targetChainId } from "@/lib/wagmi-config";
import {
  getIntent,
  getSettlementOutboxEvents,
  listIntents,
  type IntentRecord,
  type ReleaseSubmitResponse,
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

const INTENT_LIST_PAGE_SIZE = 10;

/** 最新在前（与 API 一致）；缺 createdAt 时退化为 intentId 字典序倒序 */
function sortIntentsNewestFirst(list: IntentRecord[]): IntentRecord[] {
  return [...list].sort((a, b) => {
    const ta = a.createdAt != null ? Date.parse(a.createdAt) : NaN;
    const tb = b.createdAt != null ? Date.parse(b.createdAt) : NaN;
    const fa = Number.isFinite(ta) ? ta : 0;
    const fb = Number.isFinite(tb) ? tb : 0;
    if (fb !== fa) return fb - fa;
    return b.intentId.localeCompare(a.intentId);
  });
}

export default function MerchantConsole() {
  const { locale } = useI18n();
  const text = useMemo(() => {
    return {
    "zh-CN": {
      title: "商家",
      console: "控制台",
      subtitle: "合同意向 · 状态 · 历史 · 用户消费",
      home: "首页",
      connectWallet: "连接钱包",
      connecting: "连接中…",
      chooseWallet: "选择钱包",
      close: "关闭",
      walletHint:
        "列表来自钱包的 EIP-6963 广播；点选即可连接。若某扩展明确报告不可用，会显示「未检测到」并禁用。",
      walletUnavailable: "未检测到",
      noWalletDetected:
        "当前没有检测到钱包。请确认已安装 MetaMask / Rabby 等扩展；部分环境需用桌面 Chrome 且页面由 HTTPS 或 localhost 打开，扩展才会注入。",
      disconnect: "断开",
      switchTo: "切换到",
      wrongChainNeed: "需",
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
      merchantSignHint:
        "在下方列表中选择一条合同意向后，可在此连接钱包并完成商家签名，以推进链上托管分期放款。",
      noEvents: "暂无事件，点击右上角刷新。",
      userAddress: "用户地址（完整）",
      totalSpend: "累计消费",
      settled: "已结算",
      locked: "托管中",
      notFoundUser: "未找到该用户记录。",
      deepLinkNotFound:
        "找不到合同意向：{id}。请确认 NEXT_PUBLIC_PAYFI_API_URL 与新建该意向时相同（例如本地 http://127.0.0.1:8787 与 Railway 不可混用）。",
      paginationPrev: "上一页",
      paginationNext: "下一页",
      paginationPage: "第 {page} / {total} 页",
    },
    "zh-TW": {
      title: "商家",
      console: "控制台",
      subtitle: "合同意向 · 狀態 · 歷史 · 使用者消費",
      home: "首頁",
      connectWallet: "連接錢包",
      connecting: "連接中…",
      chooseWallet: "選擇錢包",
      close: "關閉",
      walletHint:
        "清單來自錢包的 EIP-6963 廣播；點選即可連接。若某擴充明確回報不可用，會顯示「未檢測到」並停用。",
      walletUnavailable: "未檢測到",
      noWalletDetected:
        "目前未檢測到錢包。請確認已安裝 MetaMask / Rabby 等擴充；部分環境需使用桌面 Chrome，且頁面由 HTTPS 或 localhost 開啟，擴充才會注入。",
      disconnect: "斷開",
      switchTo: "切換到",
      wrongChainNeed: "需",
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
      merchantSignHint:
        "在下方列表中選擇一筆合同意向後，可在此連接錢包並完成商家簽名，以推進鏈上託管分期放款。",
      noEvents: "暫無事件，點擊右上角刷新。",
      userAddress: "使用者地址（完整）",
      totalSpend: "累計消費",
      settled: "已結算",
      locked: "託管中",
      notFoundUser: "未找到該使用者記錄。",
      deepLinkNotFound:
        "找不到合同意向：{id}。請確認 NEXT_PUBLIC_PAYFI_API_URL 與新建該意向時相同（例如本機 http://127.0.0.1:8787 與 Railway 不可混用）。",
      paginationPrev: "上一頁",
      paginationNext: "下一頁",
      paginationPage: "第 {page} / {total} 頁",
    },
    en: {
      title: "Merchant",
      console: "Console",
      subtitle: "Contract Intents · Status · History · User Spend",
      home: "Home",
      connectWallet: "Connect wallet",
      connecting: "Connecting…",
      chooseWallet: "Choose wallet",
      close: "Close",
      walletHint:
        "Wallets are discovered via EIP-6963. Click to connect. If a wallet reports unavailable, it is disabled.",
      walletUnavailable: "Unavailable",
      noWalletDetected:
        "No wallet detected. Please install MetaMask/Rabby. In some environments, injection requires desktop Chrome and pages served from HTTPS or localhost.",
      disconnect: "Disconnect",
      switchTo: "Switch to",
      wrongChainNeed: "need",
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
      merchantSignHint:
        "Select a contract intent from the list below to connect a wallet and sign as merchant to advance on-chain escrow installment disbursement.",
      noEvents: "No events yet. Click Refresh above.",
      userAddress: "User address (full)",
      totalSpend: "Total Spend",
      settled: "Settled",
      locked: "In Escrow",
      notFoundUser: "No records found for this user.",
      deepLinkNotFound:
        "Contract intent not found: {id}. Ensure NEXT_PUBLIC_PAYFI_API_URL matches the API used when the intent was created (do not mix local :8787 and Railway).",
      paginationPrev: "Previous",
      paginationNext: "Next",
      paginationPage: "Page {page} / {total}",
    },
  }[locale];
  }, [locale]);
  const [tab, setTab] = useState<TabKey>("intents");
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intents, setIntents] = useState<IntentRecord[]>([]);
  const [intentListPage, setIntentListPage] = useState(1);
  const [events, setEvents] = useState<SettlementOutboxEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("");
  const [spendUser, setSpendUser] = useState("");
  const [selectedIntentId, setSelectedIntentId] = useState("");
  const searchParams = useSearchParams();
  const intentIdQuery = searchParams.get("intentId")?.trim() ?? "";
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switchPending } = useSwitchChain();
  const [mounted, setMounted] = useState(false);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveIsConnected = mounted ? isConnected : false;
  const effectiveChainId = mounted ? chainId : targetChainId;
  const effectiveAddress = mounted ? address : null;
  const onWrongChain = effectiveChainId !== targetChainId;
  const walletConnectors = useMemo(
    () => [...connectors].sort((a, b) => a.name.localeCompare(b.name, "en")),
    [connectors],
  );

  useEffect(() => {
    const q = searchParams.get("intentId")?.trim();
    if (q) {
      setSelectedIntentId(q);
      setTab("intents");
    }
  }, [searchParams]);

  useEffect(() => {
    if (isConnected) setWalletPickerOpen(false);
  }, [isConnected]);

  useEffect(() => {
    if (!walletPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWalletPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walletPickerOpen]);

  useEffect(() => {
    if (!walletPickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [walletPickerOpen]);

  const reload = useCallback(async (opts?: { releaseSnapshot?: ReleaseSubmitResponse }) => {
    setLoading(true);
    setError(null);
    try {
      const [rows, outbox] = await Promise.all([
        listIntents(),
        getSettlementOutboxEvents(),
      ]);
      let ordered = sortIntentsNewestFirst(rows);
      const snap = opts?.releaseSnapshot;
      if (snap?.ok && snap.intentId) {
        const idx = ordered.findIndex((i) => i.intentId === snap.intentId);
        if (idx >= 0) {
          ordered = [...ordered];
          ordered[idx] = {
            ...ordered[idx]!,
            status: snap.status as IntentRecord["status"],
            releaseNonce: snap.releaseNonce,
            releaseCount: snap.releaseCount,
            releasedTotal: snap.releasedTotal,
            userSig: undefined,
            merchantSig: undefined,
            userSigAt: undefined,
            merchantSigAt: undefined,
          };
          ordered = sortIntentsNewestFirst(ordered);
        }
      }
      setIntents(ordered);
      setEvents(outbox.slice().reverse());

      // Deep link: list can be empty or miss the row (stale client / different query timing).
      if (intentIdQuery && !ordered.some((r) => r.intentId === intentIdQuery)) {
        try {
          const one = await getIntent(intentIdQuery);
          setIntents((prev) =>
            prev.some((i) => i.intentId === one.intentId)
              ? prev
              : sortIntentsNewestFirst([...prev, one]),
          );
        } catch {
          setError(text.deepLinkNotFound.replace("{id}", intentIdQuery));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [intentIdQuery, text]);

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

  const intentListTotalPages = useMemo(() => {
    const n = filteredIntents.length;
    return Math.max(1, Math.ceil(n / INTENT_LIST_PAGE_SIZE));
  }, [filteredIntents.length]);

  const pagedFilteredIntents = useMemo(() => {
    const start = (intentListPage - 1) * INTENT_LIST_PAGE_SIZE;
    return filteredIntents.slice(start, start + INTENT_LIST_PAGE_SIZE);
  }, [filteredIntents, intentListPage]);

  useEffect(() => {
    setIntentListPage(1);
  }, [statusFilter, userFilter]);

  useEffect(() => {
    if (intentListPage > intentListTotalPages) {
      setIntentListPage(intentListTotalPages);
    }
  }, [intentListPage, intentListTotalPages]);

  /** When search narrows to one row or pastes a full intentId, align selection (avoid showing another intent from ?intentId= or auto-select). */
  const filterIntentLookupRef = useRef<string | null>(null);
  useEffect(() => {
    const q = userFilter.trim();
    const lower = q.toLowerCase();
    if (!q) return;

    const exact = intents.find((i) => i.intentId.toLowerCase() === lower);
    if (exact) {
      setSelectedIntentId(exact.intentId);
      filterIntentLookupRef.current = null;
      return;
    }

    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(q) && filterIntentLookupRef.current !== lower) {
      filterIntentLookupRef.current = lower;
      void getIntent(q)
        .then((one) => {
          setIntents((prev) =>
            prev.some((i) => i.intentId === one.intentId)
              ? prev
              : sortIntentsNewestFirst([...prev, one]),
          );
          setSelectedIntentId(one.intentId);
        })
        .catch(() => {
          filterIntentLookupRef.current = null;
        });
      return;
    }

    if (filteredIntents.length === 1) {
      setSelectedIntentId(filteredIntents[0]!.intentId);
    }
  }, [userFilter, intents, filteredIntents]);

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
  }, [reload]);

  useEffect(() => {
    if (selectedIntentId.trim()) return;
    const firstReleasable = intents.find(
      (i) => i.status === "active" || i.status === "partially_settled",
    );
    if (firstReleasable) {
      setSelectedIntentId(firstReleasable.intentId);
    }
  }, [intents, selectedIntentId]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col gap-6 px-4 pb-12 pt-4 sm:max-w-6xl sm:px-6">
      <div className="sticky top-0 z-50 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          {text.home}
        </Link>
      </div>
      <header className="payfi-card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <PayFiLogo />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="payfi-title-gradient">{text.title}</span>
              <span className="payfi-title-gradient"> {text.console}</span>
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{text.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pr-20 sm:pr-32">
          {!effectiveIsConnected ? (
            <>
              <button
                type="button"
                disabled={connectPending || !mounted}
                onClick={() => setWalletPickerOpen((o) => !o)}
                className="payfi-btn-primary text-xs"
                aria-expanded={walletPickerOpen}
                aria-haspopup="dialog"
                aria-controls="wallet-picker-panel"
              >
                {connectPending ? text.connecting : text.connectWallet}
              </button>
              {mounted &&
                walletPickerOpen &&
                typeof document !== "undefined" &&
                createPortal(
                  <div className="fixed inset-0 z-[100]" role="presentation">
                    <button
                      type="button"
                      className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                      aria-label={text.close}
                      onClick={() => setWalletPickerOpen(false)}
                    />
                    <aside
                      id="wallet-picker-panel"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="wallet-picker-title"
                      className="absolute right-0 top-0 z-[101] flex h-full w-[min(19rem,100vw)] flex-col border-l border-white/10 bg-zinc-950/98 py-4 shadow-[-16px_0_48px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:right-4 sm:top-4 sm:h-[calc(100vh-2rem)] sm:rounded-2xl sm:border sm:border-white/10"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 pb-3">
                        <h2
                          id="wallet-picker-title"
                          className="text-sm font-semibold tracking-tight text-zinc-100"
                        >
                          {text.chooseWallet}
                        </h2>
                        <button
                          type="button"
                          onClick={() => setWalletPickerOpen(false)}
                          className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                          aria-label={text.close}
                        >
                          {text.close}
                        </button>
                      </div>
                      <p className="px-4 pt-3 text-[11px] leading-relaxed text-zinc-500">
                        {text.walletHint}
                      </p>
                      <div
                        role="listbox"
                        aria-labelledby="wallet-picker-title"
                        className="mt-2 flex-1 overflow-y-auto px-2 pb-4"
                      >
                        {walletConnectors.length === 0 ? (
                          <p className="px-2 py-4 text-xs leading-relaxed text-zinc-500">
                            {text.noWalletDetected}
                          </p>
                        ) : (
                          walletConnectors.map((c) => {
                            const unavailable = c.ready === false;
                            return (
                              <button
                                key={`${c.id}-${c.uid}`}
                                type="button"
                                role="option"
                                aria-selected={false}
                                disabled={unavailable || connectPending}
                                onClick={() => {
                                  connect({ connector: c });
                                  setWalletPickerOpen(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                {unavailable && (
                                  <span className="shrink-0 text-[10px] font-normal text-zinc-500">
                                    {text.walletUnavailable}
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </aside>
                  </div>,
                  document.body,
                )}
            </>
          ) : (
            <>
              <span className="font-mono text-[11px] text-zinc-300">{effectiveAddress ?? "—"}</span>
              {connector && <span className="text-[11px] text-zinc-500">· {connector.name}</span>}
              <button
                type="button"
                onClick={() => disconnect()}
                className="payfi-btn-ghost text-xs"
              >
                {text.disconnect}
              </button>
            </>
          )}
          {effectiveIsConnected && onWrongChain && (
            <button
              type="button"
              disabled={switchPending}
              onClick={() => void switchChainAsync({ chainId: targetChainId })}
              className="payfi-btn-secondary text-xs"
            >
              {text.switchTo} {targetChain.name}
            </button>
          )}
          {effectiveIsConnected && (
            <span className="text-[11px] text-zinc-500">
              {effectiveChainId}
              {onWrongChain && ` → ${text.wrongChainNeed} ${targetChainId}`}
            </span>
          )}
        </div>
      </header>

      {error && <div className="payfi-alert-error">{error}</div>}

      <nav className="payfi-segment flex w-full flex-wrap justify-center sm:justify-start">
        {(
          [
            ["intents", text.intents],
            ["dashboard", text.overview],
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
            {pagedFilteredIntents.map((i) => (
              <div
                key={i.intentId}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedIntentId(i.intentId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedIntentId(i.intentId);
                  }
                }}
                className={`payfi-card payfi-card-hover flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left outline-none transition ${
                  selectedIntentId === i.intentId ? "ring-1 ring-inset ring-sky-500/45" : ""
                }`}
              >
                <span className="truncate font-mono text-[11px] text-zinc-300">{i.intentId}</span>
                <span className="shrink-0 text-xs text-zinc-500">{statusText(i.status, locale)}</span>
              </div>
            ))}
          </div>
          {filteredIntents.length > INTENT_LIST_PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                disabled={intentListPage <= 1}
                onClick={() => setIntentListPage((p) => Math.max(1, p - 1))}
                className="payfi-btn-secondary text-xs"
              >
                {text.paginationPrev}
              </button>
              <span className="text-xs text-zinc-500">
                {text.paginationPage
                  .replace("{page}", String(intentListPage))
                  .replace("{total}", String(intentListTotalPages))}
              </span>
              <button
                type="button"
                disabled={intentListPage >= intentListTotalPages}
                onClick={() =>
                  setIntentListPage((p) => Math.min(intentListTotalPages, p + 1))
                }
                className="payfi-btn-secondary text-xs"
              >
                {text.paginationNext}
              </button>
            </div>
          )}
          {!selectedIntent ? (
            <p className="text-xs text-zinc-500">{text.merchantSignHint}</p>
          ) : (
            <>
              <MerchantReleasePanel intent={selectedIntent} onIntentRefresh={reload} />
              {targetChainId === HASHKEY_TESTNET_CHAIN_ID && (
                <GatewayReconciliationCard intent={selectedIntent} />
              )}
            </>
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
