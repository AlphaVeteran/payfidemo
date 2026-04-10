"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";
import { getAddress, recoverTypedDataAddress } from "viem";
import { domainFromApi, releaseMessageFromApi } from "@/lib/release-typed-data";
import {
  getReleaseSignatures,
  releasePrepare,
  releaseSubmit,
  saveReleaseSignature,
  type IntentRecord,
} from "@/lib/payfi-api";
import { releaseStoreKey, type StoredReleaseState } from "@/lib/release-local-state";
import { targetChain, targetChainId } from "@/lib/wagmi-config";
import { useI18n } from "@/lib/i18n";

type Props = {
  intent: IntentRecord | null;
  onIntentRefresh: () => Promise<void>;
};

export default function MerchantReleasePanel({ intent, onIntentRefresh }: Props) {
  const { locale } = useI18n();
  const text = {
    "zh-CN": {
      title: "商家签名（双签释放）",
      lead: "连接与合同意向「商家」一致的钱包，完成 EIP-712 商家签名。用户签名须已在用户工作台完成。",
      connectWallet: "连接钱包",
      connecting: "连接中…",
      chooseWallet: "选择钱包",
      close: "关闭",
      walletHint:
        "列表来自钱包的 EIP-6963 广播；点选即可连接。若某扩展明确报告不可用，会显示「未检测到」并禁用。",
      walletUnavailable: "未检测到",
      noWalletDetected:
        "当前没有检测到钱包。请确认已安装 MetaMask / Rabby 等扩展；部分环境需用桌面 Chrome 且页面由 HTTPS 或 localhost 打开，扩展才会注入。",
      disconnect: "断开",
      switchTo: "切换到",
      currentWallet: "当前钱包",
      notConnected: "未连接",
      expectedMerchant: "合同商家地址",
      needUserSignFirst:
        "本地尚未检测到用户签名。你仍可先完成「商家签名」；随后回到用户工作台（同一 intentId）提交释放。",
      signAsMerchant: "商家签名",
      signing: "签名中…",
      submitRelease: "提交链上释放",
      submitting: "提交中…",
      userWorkbench: "用户工作台",
      openUserSign: "打开用户工作台完成用户签名 →",
      needBothSigs: "需要用户与商家双方签名后才能提交。",
      merchantSigRecoverFail: "商家签名恢复地址与合同意向商家不一致。",
      walletMustBeMerchant: "当前钱包必须是合同意向商家：",
      switchAccount: "请在钱包中切换账户。",
      nonceDesyncHint:
        "检测到 releaseNonce 不一致：链上状态已变化。已清空本地签名，请让用户重新用户签名后再试。",
      wrongStatus: "当前意向状态不需要商家签名（需托管中或部分结算）。",
      noIntent: "请从上方列表选择一个合同意向。",
      sigPreview: "签名状态",
      userSig: "userSig",
      merchantSig: "merchantSig",
    },
    "zh-TW": {
      title: "商家簽名（雙簽釋放）",
      lead: "連接與合同意向「商家」一致的錢包，完成 EIP-712 商家簽名。使用者簽名須已在使用者工作台完成。",
      connectWallet: "連接錢包",
      connecting: "連接中…",
      chooseWallet: "選擇錢包",
      close: "關閉",
      walletHint:
        "列表來自錢包的 EIP-6963 廣播；點選即可連接。若某擴充明確回報不可用，會顯示「未偵測到」並停用。",
      walletUnavailable: "未偵測到",
      noWalletDetected:
        "目前沒有偵測到錢包。請確認已安裝 MetaMask / Rabby 等擴充；部分環境需用桌面 Chrome 且頁面由 HTTPS 或 localhost 開啟，擴充才會注入。",
      disconnect: "斷開",
      switchTo: "切換到",
      currentWallet: "目前錢包",
      notConnected: "未連接",
      expectedMerchant: "合同商家地址",
      needUserSignFirst:
        "本地尚未偵測到使用者簽名。你仍可先完成「商家簽名」；之後回到使用者工作台（同一 intentId）提交釋放。",
      signAsMerchant: "商家簽名",
      signing: "簽名中…",
      submitRelease: "提交鏈上釋放",
      submitting: "提交中…",
      userWorkbench: "使用者工作台",
      openUserSign: "開啟使用者工作台完成使用者簽名 →",
      needBothSigs: "需要使用者與商家雙方簽名後才能提交。",
      merchantSigRecoverFail: "商家簽名還原地址與合同意向商家不一致。",
      walletMustBeMerchant: "目前錢包必須是合同意向商家：",
      switchAccount: "請在錢包中切換帳戶。",
      nonceDesyncHint:
        "偵測到 releaseNonce 不一致：鏈上狀態已變化。已清空本機簽名，請讓使用者重新使用者簽名後再試。",
      wrongStatus: "目前合同意向狀態不需要商家簽名（需託管中或部分結算）。",
      noIntent: "請從上方列表選擇一個合同意向。",
      sigPreview: "簽名狀態",
      userSig: "userSig",
      merchantSig: "merchantSig",
    },
    en: {
      title: "Merchant sign (dual-sign release)",
      lead: "Connect a wallet matching the intent merchant address and complete the EIP-712 merchant signature. The user must sign first on the User console.",
      connectWallet: "Connect wallet",
      connecting: "Connecting…",
      chooseWallet: "Choose wallet",
      close: "Close",
      walletHint:
        "Wallets are listed from EIP-6963 discovery. If an extension reports unavailable, it shows as not detected and is disabled.",
      walletUnavailable: "Not detected",
      noWalletDetected:
        "No wallet detected. Install MetaMask / Rabby; some setups require desktop Chrome and HTTPS or localhost for injection.",
      disconnect: "Disconnect",
      switchTo: "Switch to",
      currentWallet: "Wallet",
      notConnected: "Not connected",
      expectedMerchant: "Intent merchant",
      needUserSignFirst:
        "No local user signature detected yet. You can still sign as merchant first, then submit release from the User console with the same intentId.",
      signAsMerchant: "Sign as merchant",
      signing: "Signing…",
      submitRelease: "Submit release",
      submitting: "Submitting…",
      userWorkbench: "User console",
      openUserSign: "Open User console to sign as user →",
      needBothSigs: "Both user and merchant signatures are required before submit.",
      merchantSigRecoverFail: "Recovered merchant signature does not match intent merchant.",
      walletMustBeMerchant: "Wallet must be intent merchant:",
      switchAccount: "Switch account in your wallet.",
      nonceDesyncHint:
        "releaseNonce desync: on-chain state changed. Local signatures cleared; have the user sign again first.",
      wrongStatus: "This intent does not need a merchant signature (must be active or partially settled).",
      noIntent: "Select a contract intent from the list above.",
      sigPreview: "Signatures",
      userSig: "userSig",
      merchantSig: "merchantSig",
    },
  }[locale];

  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switchPending } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();

  const [mounted, setMounted] = useState(false);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [userSig, setUserSig] = useState<`0x${string}` | null>(null);
  const [merchantSig, setMerchantSig] = useState<`0x${string}` | null>(null);
  const [releasePrep, setReleasePrep] = useState<StoredReleaseState["releasePrep"]>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveIsConnected = mounted ? isConnected : false;
  const effectiveChainId = mounted ? chainId : targetChainId;
  const effectiveAddress = mounted ? address : null;
  const onWrongChain = effectiveChainId !== targetChainId;

  const walletConnectors = useMemo(
    () => [...connectors].sort((a, b) => a.name.localeCompare(b.name, "en")),
    [connectors],
  );

  const id = intent?.intentId?.trim() ?? "";

  useEffect(() => {
    if (!mounted || !id) {
      setUserSig(null);
      setMerchantSig(null);
      setReleasePrep(null);
      return;
    }
    void (async () => {
      try {
        const sigs = await getReleaseSignatures(id);
        setUserSig(sigs.userSig);
        setMerchantSig(sigs.merchantSig);
      } catch {
        // ignore API errors for signature fetch
      }
      try {
        const raw = window.localStorage.getItem(releaseStoreKey(id));
        if (!raw) return;
        const parsed = JSON.parse(raw) as StoredReleaseState;
        setReleasePrep(parsed.releasePrep ?? null);
      } catch {
        // ignore
      }
    })();
  }, [id, mounted]);

  useEffect(() => {
    if (!mounted || !id) return;
    const snapshot: StoredReleaseState = { userSig, merchantSig, releasePrep };
    window.localStorage.setItem(releaseStoreKey(id), JSON.stringify(snapshot));
  }, [id, userSig, merchantSig, releasePrep, mounted]);

  useEffect(() => {
    if (isConnected) setWalletPickerOpen(false);
  }, [isConnected]);

  useEffect(() => {
    if (!walletPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWalletPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walletPickerOpen]);

  useEffect(() => {
    if (!walletPickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [walletPickerOpen]);

  const clearLocal = useCallback(() => {
    setUserSig(null);
    setMerchantSig(null);
    setReleasePrep(null);
    if (mounted && id) {
      window.localStorage.removeItem(releaseStoreKey(id));
    }
  }, [mounted, id]);

  const ensureTargetChain = async () => {
    if (chainId !== targetChainId) {
      await switchChainAsync({ chainId: targetChainId });
    }
  };

  const onSignMerchant = async () => {
    if (!intent || !address) {
      setHint(text.notConnected);
      return;
    }
    setHint(null);
    setBusy("sign-merchant");
    try {
      await ensureTargetChain();
      if (getAddress(address) !== getAddress(intent.merchant)) {
        throw new Error(`${text.walletMustBeMerchant} ${intent.merchant}. ${text.switchAccount}`);
      }
      const prep = releasePrep ?? (await releasePrepare(intent.intentId));
      const domain = domainFromApi(prep.typedData.domain as Record<string, unknown>);
      const message = releaseMessageFromApi(prep.typedData.message);
      const types = prep.typedData.types as Record<
        string,
        Array<{ name: string; type: string }>
      >;
      const sig = await signTypedDataAsync({
        domain,
        types,
        primaryType: "Release",
        message,
      });
      const recovered = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: "Release",
        message,
        signature: sig,
      });
      if (getAddress(recovered) !== getAddress(intent.merchant)) {
        throw new Error(text.merchantSigRecoverFail);
      }
      setReleasePrep(prep);
      setMerchantSig(sig);
      await saveReleaseSignature(intent.intentId, "merchant", sig);
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onSubmitRelease = async () => {
    if (!intent) {
      setHint(text.needBothSigs);
      return;
    }
    setHint(null);
    setBusy("submit-release");
    try {
      const sigs = await getReleaseSignatures(intent.intentId);
      const submitUserSig = userSig ?? sigs.userSig;
      const submitMerchantSig = merchantSig ?? sigs.merchantSig;
      if (!submitUserSig || !submitMerchantSig) {
        throw new Error(text.needBothSigs);
      }
      await releaseSubmit(intent.intentId, submitUserSig, submitMerchantSig);
      clearLocal();
      await onIntentRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/releaseNonce desync|nonce desync/i.test(msg)) {
        clearLocal();
        setHint(text.nonceDesyncHint);
        await onIntentRefresh();
      } else {
        setHint(msg);
      }
    } finally {
      setBusy(null);
    }
  };

  if (!intent) {
    return (
      <div className="payfi-card border border-white/8 p-4 text-sm text-zinc-500">{text.noIntent}</div>
    );
  }

  if (intent.status !== "active" && intent.status !== "partially_settled") {
    return (
      <div className="payfi-card border border-white/8 p-4 text-sm text-zinc-500">{text.wrongStatus}</div>
    );
  }

  const userSignLink = `/user?intentId=${encodeURIComponent(intent.intentId)}`;

  return (
    <section className="payfi-card space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">{text.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{text.lead}</p>
        <Link
          href={userSignLink}
          className="mt-2 inline-flex text-xs font-medium text-sky-400 underline-offset-2 hover:underline"
        >
          {text.openUserSign}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/8 pb-4">
        {!effectiveIsConnected ? (
          <>
            <button
              type="button"
              disabled={connectPending || !mounted}
              onClick={() => setWalletPickerOpen((o) => !o)}
              className="payfi-btn-primary text-xs"
              aria-expanded={walletPickerOpen}
            >
              {connectPending ? text.connecting : text.connectWallet}
            </button>
            {mounted &&
              walletPickerOpen &&
              typeof document !== "undefined" &&
              createPortal(
                <div className="fixed inset-0 z-[100]" role="presentation">
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                    aria-label={text.close}
                    onClick={() => setWalletPickerOpen(false)}
                  />
                  <aside
                    role="dialog"
                    aria-modal="true"
                    className="absolute right-0 top-0 z-[101] flex h-full w-[min(19rem,100vw)] flex-col border-l border-white/10 bg-zinc-950/98 py-4 shadow-[-16px_0_48px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:right-4 sm:top-4 sm:h-[calc(100vh-2rem)] sm:rounded-2xl sm:border sm:border-white/10"
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 pb-3">
                      <h2 className="text-sm font-semibold text-zinc-100">{text.chooseWallet}</h2>
                      <button
                        type="button"
                        onClick={() => setWalletPickerOpen(false)}
                        className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/10"
                        aria-label={text.close}
                      >
                        {text.close}
                      </button>
                    </div>
                    <p className="px-4 pt-3 text-[11px] text-zinc-500">{text.walletHint}</p>
                    <div className="mt-2 flex-1 overflow-y-auto px-2 pb-4">
                      {walletConnectors.length === 0 ? (
                        <p className="px-2 py-4 text-xs text-zinc-500">{text.noWalletDetected}</p>
                      ) : (
                        walletConnectors.map((c) => {
                          const unavailable = c.ready === false;
                          return (
                            <button
                              key={`${c.id}-${c.uid}`}
                              type="button"
                              disabled={unavailable || connectPending}
                              onClick={() => {
                                connect({ connector: c });
                                setWalletPickerOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.08] disabled:opacity-40"
                            >
                              <span className="min-w-0 flex-1 truncate">{c.name}</span>
                              {unavailable && (
                                <span className="text-[10px] text-zinc-500">{text.walletUnavailable}</span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </aside>
                </div>,
                document.body,
              )}
          </>
        ) : (
          <>
            <span className="font-mono text-[11px] text-zinc-300">
              {effectiveAddress ?? "—"}
            </span>
            {connector && (
              <span className="text-[11px] text-zinc-500">· {connector.name}</span>
            )}
            <button type="button" onClick={() => disconnect()} className="payfi-btn-ghost text-xs">
              {text.disconnect}
            </button>
          </>
        )}
        {effectiveIsConnected && onWrongChain && (
          <button
            type="button"
            disabled={switchPending}
            onClick={() => void switchChainAsync({ chainId: targetChainId })}
            className="payfi-btn-secondary text-xs"
          >
            {text.switchTo} {targetChain.name}
          </button>
        )}
        {effectiveIsConnected && (
          <span className="text-[11px] text-zinc-500">
            {effectiveChainId}
            {onWrongChain && ` → ${targetChainId}`}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-3 text-xs text-zinc-400">
        <div>
          {text.currentWallet}{" "}
          <span className="font-mono text-zinc-300">{effectiveAddress ?? text.notConnected}</span>
        </div>
        <div className="mt-1">
          {text.expectedMerchant}{" "}
          <span className="font-mono text-zinc-300">{intent.merchant}</span>
        </div>
      </div>

      {!userSig && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-sm text-amber-100/90">
          {text.needUserSignFirst}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={Boolean(busy) || onWrongChain}
          onClick={() => void onSignMerchant()}
          className="payfi-btn-secondary text-xs"
        >
          {busy === "sign-merchant" ? text.signing : text.signAsMerchant}
        </button>
        <button
          type="button"
          disabled={Boolean(busy) || !userSig || !merchantSig}
          onClick={() => void onSubmitRelease()}
          className="payfi-btn-primary text-xs"
        >
          {busy === "submit-release" ? text.submitting : text.submitRelease}
        </button>
      </div>

      <div className="grid gap-1 font-mono text-[11px] text-zinc-500">
        <span>
          {text.userSig}: {userSig ? `${userSig.slice(0, 18)}…` : "—"}
        </span>
        <span>
          {text.merchantSig}: {merchantSig ? `${merchantSig.slice(0, 18)}…` : "—"}
        </span>
      </div>

      {hint && <div className="payfi-alert-warn text-sm">{hint}</div>}
    </section>
  );
}
