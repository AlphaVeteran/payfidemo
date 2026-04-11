"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { HASHKEY_TESTNET_CHAIN_ID } from "@/lib/demo-network";
import { ensureHashKeyTestnetInWallet, type MinimalEip1193Provider } from "@/lib/hashkey-testnet-eip1193";
import { useI18n } from "@/lib/i18n";

type Props = {
  /** 仅当目标为 HashKey 测试网时由父组件传入 true */
  enabled: boolean;
  className?: string;
};

function getInjectedProvider(): MinimalEip1193Provider | null {
  if (typeof window === "undefined") return null;
  const win = window as Window & { ethereum?: MinimalEip1193Provider & { providers?: MinimalEip1193Provider[] } };
  const raw = win.ethereum;
  if (!raw) return null;
  // MetaMask + 多注入时常见：优先 isMetaMask
  const multi = raw.providers;
  if (multi?.length) {
    const mm = multi.find((p) => (p as { isMetaMask?: boolean }).isMetaMask);
    return mm ?? multi[0] ?? null;
  }
  return raw;
}

export default function AddHashKeyNetworkButton({ enabled, className = "payfi-btn-secondary text-xs" }: Props) {
  const { locale } = useI18n();
  const text = {
    "zh-CN": {
      lead:
        "若只有「切换网络」、没有「添加网络」弹窗：点下面按钮，由站点调用 wallet_addEthereumChain（MetaMask 会提示添加）。",
      label: "添加并切换 HashKey 测试网",
      loading: "钱包中…",
      noWallet: "未检测到浏览器钱包扩展（如 MetaMask）。请先安装并刷新页面。",
      wrongEnv: "当前前端未配置为 HashKey Chain Testnet。",
      done: "已在钱包中添加/切换到 HashKey 测试网。",
    },
    "zh-TW": {
      lead:
        "若只有「切換網路」、沒有「新增網路」彈窗：點下方按鈕，由網站呼叫 wallet_addEthereumChain（MetaMask 會提示新增）。",
      label: "新增並切換 HashKey 測試網",
      loading: "錢包中…",
      noWallet: "未偵測到瀏覽器錢包擴充（如 MetaMask）。請先安裝並重新整理頁面。",
      wrongEnv: "目前前端未設定為 HashKey Chain Testnet。",
      done: "已在錢包中新增/切換到 HashKey 測試網。",
    },
    en: {
      lead:
        'If "Switch network" never offers "Add network", click below to call wallet_addEthereumChain (MetaMask will prompt).',
      label: "Add & switch HashKey Testnet",
      loading: "Confirm in wallet…",
      noWallet: "No injected wallet (e.g. MetaMask). Install the extension and refresh.",
      wrongEnv: "This app is not configured for HashKey Chain Testnet.",
      done: "HashKey Testnet added/switched in your wallet.",
    },
  }[locale];

  const { connector } = useAccount();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const rpc =
    typeof process.env.NEXT_PUBLIC_CHAIN_RPC_URL === "string" && process.env.NEXT_PUBLIC_CHAIN_RPC_URL.length > 0
      ? process.env.NEXT_PUBLIC_CHAIN_RPC_URL
      : "https://testnet.hsk.xyz";
  const explorer =
    typeof process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL === "string" &&
    process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL.length > 0
      ? process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL
      : "https://testnet-explorer.hsk.xyz";

  const onClick = useCallback(async () => {
    setMsg(null);
    setErr(null);
    if (!enabled) {
      setErr(text.wrongEnv);
      return;
    }
    setBusy(true);
    try {
      let provider: MinimalEip1193Provider | null = null;
      if (connector?.getProvider) {
        const raw = connector.getProvider();
        const p = await Promise.resolve(raw);
        if (p && typeof (p as MinimalEip1193Provider).request === "function") {
          provider = p as MinimalEip1193Provider;
        }
      }
      if (!provider) {
        provider = getInjectedProvider();
      }
      if (!provider) {
        setErr(text.noWallet);
        return;
      }
      await ensureHashKeyTestnetInWallet(provider, { rpcUrl: rpc, explorerUrl: explorer });
      setMsg(text.done);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(m);
    } finally {
      setBusy(false);
    }
  }, [connector, enabled, explorer, rpc, text]);

  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-relaxed text-zinc-500">{text.lead}</p>
      <button type="button" className={className} disabled={busy} onClick={() => void onClick()}>
        {busy ? text.loading : text.label}
      </button>
      {msg && <p className="text-[11px] text-emerald-400/95">{msg}</p>}
      {err && <p className="text-[11px] text-red-400/95">{err}</p>}
      <p className="text-[10px] text-zinc-600">
        Chain ID {HASHKEY_TESTNET_CHAIN_ID} · RPC {rpc}
      </p>
    </div>
  );
}
