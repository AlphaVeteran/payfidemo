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
      loading: "加载中…",
    },
    "zh-TW": {
      home: "首頁",
      loading: "載入中…",
    },
    en: {
      home: "Home",
      loading: "Loading…",
    },
  }[locale];
  return (
    <div>
      <div className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          {text.home}
        </Link>
      </div>
      <Suspense
        fallback={
          <main className="mx-auto w-full max-w-[28rem] px-4 py-8 text-sm text-zinc-500 sm:max-w-3xl">
            {text.loading}
          </main>
        }
      >
        <PayFiDemo />
      </Suspense>
    </div>
  );
}
