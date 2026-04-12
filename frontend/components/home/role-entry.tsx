"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AddHashKeyNetworkButton from "@/components/shared/add-hashkey-network-button";
import { getPayFiHealth, listIntents, type IntentRecord } from "@/lib/payfi-api";
import { HASHKEY_TESTNET_CHAIN_ID } from "@/lib/demo-network";
import { defaultDemoAssetAddress } from "@/lib/token-addresses";
import PayFiLogo from "@/components/ui/payfi-logo";
import { useI18n } from "@/lib/i18n";

type Role = "user" | "merchant";

const roleStorageKey = "payfi.role";
const recentStorageKey = "payfi.lastIntentId";

function statusText(status: string, locale: "zh-CN" | "zh-TW" | "en") {
  switch (status) {
    case "awaiting_funding":
      return locale === "en" ? "Awaiting Funding" : "待支付";
    case "active":
      return locale === "en" ? "In Escrow" : locale === "zh-TW" ? "託管中" : "托管中";
    case "partially_settled":
      return locale === "en" ? "Partially Settled" : locale === "zh-TW" ? "部分結算" : "部分结算";
    case "settled":
      return locale === "en" ? "Settled" : locale === "zh-TW" ? "已結算" : "已结算";
    case "refunded":
      return locale === "en" ? "Refunded" : "已退款";
    default:
      return status;
  }
}

export default function RoleEntry() {
  const { locale } = useI18n();
  const router = useRouter();

  const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
  const showHashKeyHomeCards = targetChainId === HASHKEY_TESTNET_CHAIN_ID;
  const hashKeyUsdcAddress = defaultDemoAssetAddress(HASHKEY_TESTNET_CHAIN_ID);
  const escrowAddressEnv = process.env.NEXT_PUBLIC_ESCROW_ADDRESS?.trim() ?? "";
  const hashkeyGatewayUrlEnv =
    process.env.NEXT_PUBLIC_HASHKEY_MERCHANT_GATEWAY_URL?.trim() ?? "";

  const text = {
    "zh-CN": {
      subtitle: "选择角色进入流程，或在下方最近记录中打开已有意向。",
      userRole: "用户",
      merchantRole: "商家",
      iAmUser: "我是用户",
      iAmUserDesc: "支付并跟踪链上托管分期放款进度",
      userCta: "进入用户工作台 →",
      iAmMerchant: "我是商家",
      iAmMerchantDesc: "查看合同意向、状态、历史与用户消费",
      merchantCta: "进入商家控制台 →",
      recent: "最近记录",
      empty: "暂无记录",
      hashKeyCardTitle: "HashKey 测试网",
      currentSystemTitle: "payfidemo当前运行环境",
      persistenceLayerLabel: "持久化层",
      persistenceInMemory: "进程内内存（未连接数据库）",
      persistenceUnreachable: "无法获取（API 不可达）",
      usdcContractLabel: "USDC代币地址",
      escrowContractLabel: "托管合约地址",
      hashKeyGatewayLabel: "HashKey Merchant Gateway URL",
      valueUnset: "（当前未配置）",
    },
    "zh-TW": {
      subtitle: "選擇角色進入流程，或在下方最近記錄中開啟已有意向。",
      userRole: "使用者",
      merchantRole: "商家",
      iAmUser: "我是使用者",
      iAmUserDesc: "支付並追蹤鏈上託管分期放款進度",
      userCta: "進入使用者工作台 →",
      iAmMerchant: "我是商家",
      iAmMerchantDesc: "查看合同意向、狀態、歷史與使用者消費",
      merchantCta: "進入商家控制台 →",
      recent: "最近記錄",
      empty: "暫無記錄",
      hashKeyCardTitle: "HashKey 測試網",
      currentSystemTitle: "payfidemo 目前執行環境",
      persistenceLayerLabel: "持久化層",
      persistenceInMemory: "程序內記憶體（未連線資料庫）",
      persistenceUnreachable: "無法取得（API 無法連線）",
      usdcContractLabel: "USDC 代幣地址",
      escrowContractLabel: "託管合約地址",
      hashKeyGatewayLabel: "HashKey Merchant Gateway URL",
      valueUnset: "（目前未設定）",
    },
    en: {
      subtitle:
        "Choose a role to enter the flow, or open an existing intent from recent records below.",
      userRole: "User",
      merchantRole: "Merchant",
      iAmUser: "I am a User",
      iAmUserDesc: "Pay and track on-chain escrow installment disbursement",
      userCta: "Open User Console →",
      iAmMerchant: "I am a Merchant",
      iAmMerchantDesc: "View contract intents, status, history and user spend",
      merchantCta: "Open Merchant Console →",
      recent: "Recent Records",
      empty: "No records yet",
      hashKeyCardTitle: "HashKey Testnet",
      currentSystemTitle: "payfidemo current runtime environment",
      persistenceLayerLabel: "Persistence layer",
      persistenceInMemory: "In-memory store (no database)",
      persistenceUnreachable: "Unavailable (API unreachable)",
      usdcContractLabel: "USDC token address",
      escrowContractLabel: "Escrow contract address",
      hashKeyGatewayLabel: "HashKey Merchant Gateway URL",
      valueUnset: "(not set)",
    },
  }[locale];
  const [role, setRole] = useState<Role>("user");
  const [recent, setRecent] = useState<IntentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [frontendUrl, setFrontendUrl] = useState("");
  const [persistenceKind, setPersistenceKind] = useState<
    "loading" | "postgres" | "memory" | "unknown" | "error"
  >("loading");
  const [databaseProduct, setDatabaseProduct] = useState<string | null>(null);

  const chainIdEnv = process.env.NEXT_PUBLIC_CHAIN_ID?.trim();
  const chainRpcEnv = process.env.NEXT_PUBLIC_CHAIN_RPC_URL?.trim();
  const apiUrlEnv = process.env.NEXT_PUBLIC_PAYFI_API_URL?.trim().replace(/\/$/, "");

  useEffect(() => {
    setFrontendUrl(window.location.origin);
    const cachedRole = window.localStorage.getItem(roleStorageKey);
    if (cachedRole === "user" || cachedRole === "merchant") {
      setRole(cachedRole);
    }
    void (async () => {
      try {
        const rows = await listIntents();
        setRecent(rows.slice(-5).reverse());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    void getPayFiHealth()
      .then((h) => {
        if (h.persistence === "postgres") {
          setPersistenceKind("postgres");
          const name = typeof h.databaseProduct === "string" ? h.databaseProduct.trim() : "";
          setDatabaseProduct(name.length > 0 ? name : "PostgreSQL");
        } else if (h.persistence === "memory") {
          setPersistenceKind("memory");
          setDatabaseProduct(null);
        } else {
          setPersistenceKind("unknown");
          setDatabaseProduct(null);
        }
      })
      .catch(() => {
        setPersistenceKind("error");
        setDatabaseProduct(null);
      });
  }, []);

  const gotoRole = (nextRole: Role) => {
    window.localStorage.setItem(roleStorageKey, nextRole);
    setRole(nextRole);
    router.push(`/${nextRole}`);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-8 px-4 pb-12 pt-8 sm:max-w-xl sm:px-6">
      <header className="flex items-start gap-4">
        <PayFiLogo />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            <span className="payfi-title-gradient">PayFi</span>
            <span className="payfi-title-gradient"> Demo</span>
          </h1>
          <p className="text-sm leading-relaxed text-zinc-400">{text.subtitle}</p>
        </div>
      </header>

      {showHashKeyHomeCards && (
        <section className="payfi-card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">{text.hashKeyCardTitle}</h2>
          <AddHashKeyNetworkButton enabled compact className="payfi-btn-secondary w-full text-xs sm:w-auto" />
          <div className="space-y-1 text-xs">
            <p className="payfi-label">{text.usdcContractLabel}</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">{hashKeyUsdcAddress}</p>
          </div>
          <div className="space-y-1 text-xs">
            <p className="payfi-label">{text.escrowContractLabel}</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">
              {escrowAddressEnv || text.valueUnset}
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <p className="payfi-label">{text.hashKeyGatewayLabel}</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">
              {hashkeyGatewayUrlEnv || text.valueUnset}
            </p>
          </div>
        </section>
      )}

      <section className="payfi-card space-y-4 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">{text.currentSystemTitle}</h2>
        <div className="space-y-3">
          <div className="space-y-1 text-xs">
            <p className="payfi-label">CHAIN_ID</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">
              {chainIdEnv && chainIdEnv.length > 0 ? chainIdEnv : "—"}
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <p className="payfi-label">CHAIN_RPC_URL</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">
              {chainRpcEnv && chainRpcEnv.length > 0 ? chainRpcEnv : "—"}
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <p className="payfi-label">Frontend URL</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">
              {frontendUrl || "—"}
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <p className="payfi-label">API URL</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">
              {apiUrlEnv && apiUrlEnv.length > 0 ? apiUrlEnv : "—"}
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <p className="payfi-label">{text.persistenceLayerLabel}</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">
              {persistenceKind === "loading"
                ? "…"
                : persistenceKind === "postgres"
                  ? (databaseProduct ?? "PostgreSQL")
                  : persistenceKind === "memory"
                    ? text.persistenceInMemory
                    : persistenceKind === "error"
                      ? text.persistenceUnreachable
                      : "—"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <button
          type="button"
          onClick={() => gotoRole("user")}
          className="payfi-card payfi-card-hover p-5 text-left"
        >
          <h2 className="text-lg font-semibold text-zinc-100">{text.iAmUser}</h2>
          <p className="mt-1 text-sm text-zinc-400">{text.iAmUserDesc}</p>
          <p className="mt-4 text-xs font-semibold text-sky-400">{text.userCta}</p>
        </button>
        <button
          type="button"
          onClick={() => gotoRole("merchant")}
          className="payfi-card payfi-card-hover p-5 text-left"
        >
          <h2 className="text-lg font-semibold text-zinc-100">{text.iAmMerchant}</h2>
          <p className="mt-1 text-sm text-zinc-400">{text.iAmMerchantDesc}</p>
          <p className="mt-4 text-xs font-semibold text-violet-300">{text.merchantCta}</p>
        </button>
      </section>

      <div className="payfi-segment w-full justify-center sm:w-auto">
        <button
          type="button"
          data-active={role === "user"}
          onClick={() => {
            setRole("user");
            window.localStorage.setItem(roleStorageKey, "user");
          }}
        >
          {text.userRole}
        </button>
        <button
          type="button"
          data-active={role === "merchant"}
          onClick={() => {
            setRole("merchant");
            window.localStorage.setItem(roleStorageKey, "merchant");
          }}
        >
          {text.merchantRole}
        </button>
      </div>

      <section className="payfi-card space-y-3 p-5">
        <h3 className="text-sm font-semibold text-zinc-300">{text.recent}</h3>
        {error && <p className="text-xs text-amber-200/90">{error}</p>}
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">{text.empty}</p>
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
                <span className="shrink-0 text-xs text-zinc-500">
                  {statusText(item.status, locale)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
