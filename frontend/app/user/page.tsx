"use client";

import Link from "next/link";
import { Suspense } from "react";
import PayFiDemo from "@/components/payfi-demo";
import { useI18n } from "@/lib/i18n";

export default function UserPage() {
  const { locale } = useI18n();
  const text = {
    "zh-CN": { home: "← 首页", merchant: "商家端", loading: "加载中…" },
    "zh-TW": { home: "← 首頁", merchant: "商家端", loading: "載入中…" },
    en: { home: "← Home", merchant: "Merchant", loading: "Loading…" },
  }[locale];
  return (
    <div>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-6 sm:px-6">
        <Link href="/" className="payfi-link">
          {text.home}
        </Link>
        <Link href="/merchant" className="payfi-link">
          {text.merchant}
        </Link>
      </div>
      <Suspense
        fallback={<main className="mx-auto max-w-3xl px-4 py-8 text-sm text-zinc-500">{text.loading}</main>}
      >
        <PayFiDemo />
      </Suspense>
    </div>
  );
}
