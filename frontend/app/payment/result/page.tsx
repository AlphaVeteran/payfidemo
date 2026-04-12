import { Suspense } from "react";
import PaymentResultClient from "./payment-result-client";

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-4 py-16 text-sm text-zinc-500">加载中…</main>
      }
    >
      <PaymentResultClient />
    </Suspense>
  );
}
