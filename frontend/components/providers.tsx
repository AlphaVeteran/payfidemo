"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi-config";
import { I18nProvider } from "@/lib/i18n";
import LanguageSwitcher from "@/components/ui/language-switcher";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <div className="fixed right-4 top-4 z-[200]">
            <LanguageSwitcher />
          </div>
          {children}
        </I18nProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
