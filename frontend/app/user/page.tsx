"use client";

import Link from "next/link";
import { Suspense } from "react";
import PayFiDemo from "@/components/payfi-demo";
import { useI18n } from "@/lib/i18n";

export default function UserPage() {
  const { locale } = useI18n();
  const text = {
    "zh-CN": {
      home: "首页",
      homeDesc: "返回角色入口与最近记录",
      merchant: "商家端",
      merchantDesc: "查看合同意向、历史与用户消费",
      openCta: "进入 →",
      loading: "加载中…",
    },
    "zh-TW": {
      home: "首頁",
      homeDesc: "返回角色入口與最近記錄",
      merchant: "商家端",
      merchantDesc: "查看合同意向、歷史與使用者消費",
      openCta: "進入 →",
      loading: "載入中…",
    },
    en: {
      home: "Home",
      homeDesc: "Back to role entry and recent records",
      merchant: "Merchant",
      merchantDesc: "View intents, history, and user spend",
      openCta: "Open →",
      loading: "Loading…",
    },
  }[locale];
  return (
    <div>
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pr-28 sm:px-6 sm:pr-36">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/"
            className="payfi-card payfi-card-hover p-4 text-left no-underline"
          >
            <h2 className="text-sm font-semibold text-zinc-100">{text.home}</h2>
            <p className="mt-1 text-xs text-zinc-400">{text.homeDesc}</p>
            <p className="mt-3 text-xs font-semibold text-sky-300">{text.openCta}</p>
          </Link>
          <Link
            href="/merchant"
            className="payfi-card payfi-card-hover p-4 text-left no-underline"
          >
            <h2 className="text-sm font-semibold text-zinc-100">{text.merchant}</h2>
            <p className="mt-1 text-xs text-zinc-400">{text.merchantDesc}</p>
            <p className="mt-3 text-xs font-semibold text-violet-300">{text.openCta}</p>
          </Link>
        </div>
      </div>
      <Suspense
        fallback={<main className="mx-auto max-w-3xl px-4 py-8 text-sm text-zinc-500">{text.loading}</main>}
      >
        <PayFiDemo />
      </Suspense>
    </div>
  );
}
