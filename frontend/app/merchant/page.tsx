import { Suspense } from "react";
import MerchantConsole from "@/components/merchant/merchant-console";

export default function MerchantPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-500">Loading…</main>}>
      <MerchantConsole />
    </Suspense>
  );
}
