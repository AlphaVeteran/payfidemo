"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AddHashKeyNetworkButton from "@/components/shared/add-hashkey-network-button";
import { listIntents, type IntentRecord } from "@/lib/payfi-api";
import { HASHKEY_TESTNET_CHAIN_ID } from "@/lib/demo-network";
import { defaultDemoAssetAddress, demoUsdcDecimals } from "@/lib/token-addresses";
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
  const hashKeyUsdcDecimals = demoUsdcDecimals(HASHKEY_TESTNET_CHAIN_ID);
  const demoMerchantEnv = process.env.NEXT_PUBLIC_DEMO_MERCHANT?.trim() ?? "";

  const text = {
    "zh-CN": {
      subtitle: "选择角色进入流程，或通过合同意向编号（intentId）继续上次操作。",
      userRole: "用户",
      merchantRole: "商家",
      iAmUser: "我是用户",
      iAmUserDesc: "支付并跟踪链上托管分期放款进度",
      userCta: "进入用户工作台 →",
      iAmMerchant: "我是商家",
      iAmMerchantDesc: "查看合同意向、状态、历史与用户消费",
      merchantCta: "进入商家控制台 →",
      continueFlow: "继续上次流程",
      inputPlaceholder: "输入合同意向编号（intentId）",
      continue: "继续",
      perspective: "将以「{role}」视角打开详情",
      recent: "最近记录",
      empty: "暂无记录",
      hashKeyAddNetworkTitle: "钱包 · HashKey 测试网",
      hashKeyInfoTitle: "HashKey 测试网 · USDC 与创建说明",
      hashKeyInfoBody:
        "演示链上托管分期放款：使用 HashKey Chain 测试网上的测试 USDC（6 decimals）。托管总额将均分为「分期期数」笔；「托管周期」对应链上 escrow 到期前可放款/退款的时间窗（秒级精度由小时换算）。商家地址可通过 NEXT_PUBLIC_DEMO_MERCHANT 配置；未配置时仍为 Anvil 演示商家地址（双签需对应私钥）。",
      usdcContractLabel: "测试网 USDC 合约",
      demoMerchantLabel: "NEXT_PUBLIC_DEMO_MERCHANT",
      demoMerchantUnset: "（当前未配置）",
    },
    "zh-TW": {
      subtitle: "選擇角色進入流程，或透過合同意向編號（intentId）繼續上次操作。",
      userRole: "使用者",
      merchantRole: "商家",
      iAmUser: "我是使用者",
      iAmUserDesc: "支付並追蹤鏈上託管分期放款進度",
      userCta: "進入使用者工作台 →",
      iAmMerchant: "我是商家",
      iAmMerchantDesc: "查看合同意向、狀態、歷史與使用者消費",
      merchantCta: "進入商家控制台 →",
      continueFlow: "繼續上次流程",
      inputPlaceholder: "輸入合同意向編號（intentId）",
      continue: "繼續",
      perspective: "將以「{role}」視角開啟詳情",
      recent: "最近記錄",
      empty: "暫無記錄",
      hashKeyAddNetworkTitle: "錢包 · HashKey 測試網",
      hashKeyInfoTitle: "HashKey 測試網 · USDC 與建立說明",
      hashKeyInfoBody:
        "演示鏈上託管分期放款：使用 HashKey Chain 測試網上的測試 USDC（{decimals} decimals）。託管總額將均分為「分期期數」筆；「託管週期」對應鏈上 escrow 到期前可放款/退款的時間窗（秒級精度由小時換算）。商家地址可透過 NEXT_PUBLIC_DEMO_MERCHANT 設定；未設定時仍為 Anvil 示範商家地址（雙簽需對應私鑰）。",
      usdcContractLabel: "測試網 USDC 合約",
      demoMerchantLabel: "NEXT_PUBLIC_DEMO_MERCHANT",
      demoMerchantUnset: "（目前未設定）",
    },
    en: {
      subtitle:
        "Choose a role to enter the flow, or continue with a Contract Intent ID (intentId).",
      userRole: "User",
      merchantRole: "Merchant",
      iAmUser: "I am a User",
      iAmUserDesc: "Pay and track on-chain escrow installment disbursement",
      userCta: "Open User Console →",
      iAmMerchant: "I am a Merchant",
      iAmMerchantDesc: "View contract intents, status, history and user spend",
      merchantCta: "Open Merchant Console →",
      continueFlow: "Continue Previous Flow",
      inputPlaceholder: "Enter Contract Intent ID (intentId)",
      continue: "Continue",
      perspective: "Open details as {role}",
      recent: "Recent Records",
      empty: "No records yet",
      hashKeyAddNetworkTitle: "Wallet · HashKey Testnet",
      hashKeyInfoTitle: "HashKey Testnet · USDC & create form",
      hashKeyInfoBody:
        "Demo: on-chain escrow installment disbursement. Uses test USDC on HashKey Chain Testnet ({decimals} decimals). Total escrow is split by installment count; cycle hours map to on-chain escrow duration. Set merchant via NEXT_PUBLIC_DEMO_MERCHANT; if unset, the demo merchant address applies (dual-sign needs matching keys).",
      usdcContractLabel: "Testnet USDC contract",
      demoMerchantLabel: "NEXT_PUBLIC_DEMO_MERCHANT",
      demoMerchantUnset: "(not set)",
    },
  }[locale];
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
          <p className="text-sm leading-relaxed text-zinc-400">{text.subtitle}</p>
        </div>
      </header>

      {showHashKeyHomeCards && (
        <div className="flex flex-col gap-4">
          <section className="payfi-card space-y-3 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">{text.hashKeyAddNetworkTitle}</h2>
            <AddHashKeyNetworkButton enabled />
          </section>
          <section className="payfi-card space-y-3 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">{text.hashKeyInfoTitle}</h2>
            <p className="text-xs leading-relaxed text-zinc-500">
              {locale === "zh-CN"
                ? text.hashKeyInfoBody
                : text.hashKeyInfoBody.replace("{decimals}", String(hashKeyUsdcDecimals))}
            </p>
            <div className="space-y-1 text-xs">
              <p className="payfi-label">{text.usdcContractLabel}</p>
              <p className="break-all font-mono text-[11px] text-zinc-400">{hashKeyUsdcAddress}</p>
            </div>
            <div className="space-y-1 text-xs">
              <p className="payfi-label">{text.demoMerchantLabel}</p>
              <p className="break-all font-mono text-[11px] text-zinc-400">
                {demoMerchantEnv || text.demoMerchantUnset}
              </p>
            </div>
          </section>
        </div>
      )}

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

      <section className="payfi-card space-y-4 p-5">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-300">{text.continueFlow}</h3>
        <div className="flex flex-col gap-3">
          <input
            value={intentIdInput}
            onChange={(e) => setIntentIdInput(e.target.value)}
            placeholder={text.inputPlaceholder}
            className="payfi-input font-mono text-xs"
          />
          {continueHref ? (
            <Link
              href={continueHref}
              onClick={() => window.localStorage.setItem(recentStorageKey, intentIdInput.trim())}
              className="payfi-btn-primary w-full text-center no-underline"
            >
              {text.continue}
            </Link>
          ) : (
            <button type="button" disabled className="payfi-btn-primary w-full">
              {text.continue}
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          {text.perspective.replace("{role}", role === "user" ? text.userRole : text.merchantRole)}
        </p>
      </section>

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
