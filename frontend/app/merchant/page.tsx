import { Suspense } from "react";
import MerchantConsole from "@/components/merchant/merchant-console";

export default function MerchantPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-[28rem] px-4 py-8 text-sm text-zinc-500 sm:max-w-6xl">
          Loading...
        </main>
      }
    >
      <MerchantConsole />
    </Suspense>
  );
}
