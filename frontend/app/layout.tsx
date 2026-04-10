import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteDescription =
  typeof process.env.NEXT_PUBLIC_SITE_DESCRIPTION === "string" &&
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION.length > 0
    ? process.env.NEXT_PUBLIC_SITE_DESCRIPTION
    : "PayFi 托管演示：Next.js + wagmi（HashKey / 测试网可配置）";

export const metadata: Metadata = {
  title: "PayFi demo",
  description: siteDescription,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} payfi-app antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
