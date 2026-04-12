"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, useSignTypedData, useSwitchChain } from "wagmi";
import { getAddress, recoverTypedDataAddress } from "viem";
import { domainFromApi, releaseMessageFromApi } from "@/lib/release-typed-data";
import {
  getIntent,
  getReleaseSignatures,
  releasePrepare,
  releaseSubmit,
  saveReleaseSignature,
  type IntentRecord,
} from "@/lib/payfi-api";
import { releaseStoreKey, type StoredReleaseState } from "@/lib/release-local-state";
import { targetChainId } from "@/lib/wagmi-config";
import { useI18n } from "@/lib/i18n";
import DualSignIntentFacts from "@/components/shared/dual-sign-intent-facts";

type Props = {
  intent: IntentRecord | null;
  onIntentRefresh: () => Promise<void>;
};

export default function MerchantReleasePanel({ intent, onIntentRefresh }: Props) {
  const { locale } = useI18n();
  const text = {
    "zh-CN": {
      title: "商家签名（链上托管分期放款）",
      lead: "请在页面顶部连接与合同意向「商家」一致的钱包，完成 EIP-712 商家签名。用户签名须已在用户工作台完成。",
      notConnected: "未连接",
      contractIntentId: "合同意向ID",
      userAddress: "用户地址",
      expectedMerchant: "合同商家地址",
      releaseProgressLabel: "分期进度",
      escrowTotal: "托管总金额",
      merchantReceived: "商家已收到金额",
      userEscrowAmount: "用户账户金额",
      releaseNonce: "当前 nonce",
      needUserSignFirst:
        "本地尚未检测到用户签名。你仍可先完成「商家签名」；随后回到用户工作台（同一 intentId）提交分期放款。",
      nextRoundNeedResign:
        "检测到该合同已发生过分期放款（nonce 已递增）。为防重放，上一轮签名会被清空；请用户先在用户工作台重新签名，再继续本轮分期放款。",
      signAsMerchant: "商家签名",
      signing: "签名中…",
      submitRelease: "提交分期放款",
      submitting: "提交中…",
      releaseManualNote:
        "分期放款不会自动执行：需双方签完名后，由任一侧手动点击「提交分期放款」才会发送合约交易。",
      submitCooldownNote: "刚提交成功，数秒内已锁定「提交分期放款」以防重复上链。",
      intentStaleBeforeSubmit:
        "意向数据已更新（分期进度或 nonce 与页面不一致）。已刷新列表，请按当前 nonce 在用户工作台重新签名后再由商家签名并提交。",
      needBothSigs: "需要用户与商家双方签名后才能提交。",
      merchantSigRecoverFail: "商家签名恢复地址与合同意向商家不一致。",
      walletMustBeMerchant: "当前钱包必须是合同意向商家：",
      switchAccount: "请在钱包中切换账户。",
      nonceDesyncHint:
        "链上与本地 releaseNonce 不一致（可能本轮分期放款已在链上成功，或签名仍对应旧 nonce）。界面已清空缓存签名：请让用户在用户工作台按最新 nonce 重新签名 → 商家再签 → 再手动提交分期放款。分期放款不会自动上链。",
      wrongStatus: "当前意向状态不需要商家签名（需托管中或部分结算）。",
      noIntent: "请从上方列表选择一个合同意向。",
      hintCardTitle: "操作提示",
      intentFactsTitle: "合同意向详情",
      userSignRole: "用户签名",
      merchantSignRole: "商家签名",
      pendingSign: "待签名",
      timeUnknown: "—",
      amountsSection: "金额",
      amountUnitUsdc: "USDC",
      amountUnitMock: "Mock",
      refreshContract: "刷新合同",
    },
    "zh-TW": {
      title: "商家簽名（鏈上託管分期放款）",
      lead: "請在頁面頂部連接與合同意向「商家」一致的錢包，完成 EIP-712 商家簽名。使用者簽名須已在使用者工作台完成。",
      notConnected: "未連接",
      contractIntentId: "合同意向ID",
      userAddress: "使用者地址",
      expectedMerchant: "合同商家地址",
      releaseProgressLabel: "分期進度",
      escrowTotal: "託管總金額",
      merchantReceived: "商家已收到金額",
      userEscrowAmount: "使用者帳戶金額",
      releaseNonce: "目前 nonce",
      needUserSignFirst:
        "本地尚未偵測到使用者簽名。你仍可先完成「商家簽名」；之後回到使用者工作台（同一 intentId）提交分期放款。",
      nextRoundNeedResign:
        "偵測到該合同已發生過分期放款（nonce 已遞增）。為防重放，上一輪簽名會被清空；請使用者先在使用者工作台重新簽名，再繼續本輪分期放款。",
      signAsMerchant: "商家簽名",
      signing: "簽名中…",
      submitRelease: "提交分期放款",
      submitting: "提交中…",
      releaseManualNote:
        "分期放款不會自動執行：需雙方簽名後，由任一側手動點「提交分期放款」才會發送合約交易。",
      submitCooldownNote: "剛提交成功，數秒內已鎖定「提交分期放款」以防重複上鏈。",
      intentStaleBeforeSubmit:
        "意向資料已更新（分期進度或 nonce 與頁面不一致）。已重新整理清單，請依目前 nonce 在使用者工作台重新簽名後，再由商家簽名並提交。",
      needBothSigs: "需要使用者與商家雙方簽名後才能提交。",
      merchantSigRecoverFail: "商家簽名還原地址與合同意向商家不一致。",
      walletMustBeMerchant: "目前錢包必須是合同意向商家：",
      switchAccount: "請在錢包中切換帳戶。",
      nonceDesyncHint:
        "鏈上與本地 releaseNonce 不一致（可能本輪分期放款已在鏈上成功，或簽名仍對應舊 nonce）。介面已清空快取簽名：請讓使用者於使用者工作台依最新 nonce 重新簽名 → 商家再簽 → 再手動提交分期放款。分期放款不會自動上鏈。",
      wrongStatus: "目前合同意向狀態不需要商家簽名（需託管中或部分結算）。",
      noIntent: "請從上方列表選擇一個合同意向。",
      hintCardTitle: "操作提示",
      intentFactsTitle: "合同意向詳情",
      userSignRole: "使用者簽名",
      merchantSignRole: "商家簽名",
      pendingSign: "待簽名",
      timeUnknown: "—",
      amountsSection: "金額",
      amountUnitUsdc: "USDC",
      amountUnitMock: "Mock",
      refreshContract: "刷新合同",
    },
    en: {
      title: "Merchant sign (on-chain escrow installment disbursement)",
      lead: "Use the wallet control in the page header: connect with the intent merchant address, then complete the EIP-712 merchant signature. The user must sign first on the User console.",
      notConnected: "Not connected",
      contractIntentId: "Contract Intent ID",
      userAddress: "User address",
      expectedMerchant: "Intent merchant",
      releaseProgressLabel: "Installment progress",
      escrowTotal: "Total escrow",
      merchantReceived: "Merchant received",
      userEscrowAmount: "User escrow balance",
      releaseNonce: "Current nonce",
      needUserSignFirst:
        "No local user signature detected yet. You can still sign as merchant first, then submit installment disbursement from the User console with the same intentId.",
      nextRoundNeedResign:
        "A previous installment disbursement was detected (nonce advanced). Prior-round signatures are cleared to prevent replay; have the user sign again on the User console for this round.",
      signAsMerchant: "Sign as merchant",
      signing: "Signing…",
      submitRelease: "Submit installment disbursement",
      submitting: "Submitting…",
      releaseManualNote:
        "Installment disbursement is not automatic: after both parties sign, someone must click “Submit installment disbursement” to broadcast the transaction.",
      submitCooldownNote:
        "Submitted successfully — submit is locked for a few seconds to prevent duplicate on-chain txs.",
      intentStaleBeforeSubmit:
        "Intent data changed (installment progress/nonce differs from this page). List refreshed—have the user sign again on the User console for the current nonce, then merchant signs, then submit.",
      needBothSigs: "Both user and merchant signatures are required before submit.",
      merchantSigRecoverFail: "Recovered merchant signature does not match intent merchant.",
      walletMustBeMerchant: "Wallet must be intent merchant:",
      switchAccount: "Switch account in your wallet.",
      nonceDesyncHint:
        "releaseNonce mismatch (this installment may already be disbursed on-chain, or signatures were for an older nonce). Cached signatures cleared—user signs again on User console for the current nonce, then merchant, then submit manually. Disbursement is not automatic.",
      wrongStatus: "This intent does not need a merchant signature (must be active or partially settled).",
      noIntent: "Select a contract intent from the list above.",
      hintCardTitle: "Notices",
      intentFactsTitle: "Intent details",
      userSignRole: "User signature",
      merchantSignRole: "Merchant signature",
      pendingSign: "Pending",
      timeUnknown: "—",
      amountsSection: "Amounts",
      amountUnitUsdc: "USDC",
      amountUnitMock: "Mock",
      refreshContract: "Refresh contract",
    },
  }[locale];

  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();

  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [userSig, setUserSig] = useState<`0x${string}` | null>(null);
  const [merchantSig, setMerchantSig] = useState<`0x${string}` | null>(null);
  const [releasePrep, setReleasePrep] = useState<StoredReleaseState["releasePrep"]>(null);
  const releaseSubmitInFlightRef = useRef(false);
  const [releaseSubmitCooldown, setReleaseSubmitCooldown] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const onWrongChain = mounted ? chainId !== targetChainId : false;

  const id = intent?.intentId?.trim() ?? "";

  /** Prefer React state; fall back to intent payload for one frame before effects run. */
  const displayUserSig = useMemo(
    () => userSig ?? (intent?.userSig as `0x${string}` | undefined) ?? null,
    [userSig, intent?.userSig],
  );
  const displayMerchantSig = useMemo(
    () => merchantSig ?? (intent?.merchantSig as `0x${string}` | undefined) ?? null,
    [merchantSig, intent?.merchantSig],
  );

  useEffect(() => {
    setReleaseSubmitCooldown(false);
  }, [intent?.intentId]);

  useEffect(() => {
    if (!mounted || !id) {
      setUserSig(null);
      setMerchantSig(null);
      setReleasePrep(null);
      return;
    }

    let ls: StoredReleaseState | null = null;
    try {
      const raw = window.localStorage.getItem(releaseStoreKey(id));
      if (raw) ls = JSON.parse(raw) as StoredReleaseState;
    } catch {
      ls = null;
    }

    const fromIntentUser = (intent?.userSig as `0x${string}` | undefined) ?? null;
    const fromIntentMerchant =
      (intent?.merchantSig as `0x${string}` | undefined) ?? null;

    // Same key as User console: read localStorage synchronously so we don't flash "no user sig"
    // and so the persist effect below cannot overwrite with null before async merge runs.
    setUserSig(fromIntentUser ?? ls?.userSig ?? null);
    setMerchantSig(fromIntentMerchant ?? ls?.merchantSig ?? null);
    if (ls?.releasePrep && intent) {
      try {
        const msg = releaseMessageFromApi(
          ls.releasePrep.typedData.message as Record<string, unknown>,
        );
        if (msg.nonce === BigInt(intent.releaseNonce)) {
          setReleasePrep(ls.releasePrep);
        } else {
          setReleasePrep(null);
        }
      } catch {
        setReleasePrep(null);
      }
    } else {
      setReleasePrep(null);
    }

    void (async () => {
      let apiUser: `0x${string}` | null = null;
      let apiMerchant: `0x${string}` | null = null;
      try {
        const sigs = await getReleaseSignatures(id);
        apiUser = sigs.userSig;
        apiMerchant = sigs.merchantSig;
      } catch {
        // ignore API errors for signature fetch
      }

      const mergedUser = apiUser ?? fromIntentUser ?? ls?.userSig ?? null;
      const mergedMerchant = apiMerchant ?? fromIntentMerchant ?? ls?.merchantSig ?? null;
      setUserSig(mergedUser);
      setMerchantSig(mergedMerchant);
    })();
  }, [id, mounted, intent?.userSig, intent?.merchantSig, intent?.releaseNonce, intent?.intentId]);

  useEffect(() => {
    if (!mounted || !id) return;
    try {
      const raw = window.localStorage.getItem(releaseStoreKey(id));
      const prev = raw ? (JSON.parse(raw) as StoredReleaseState) : null;
      const snapshot: StoredReleaseState = {
        userSig: userSig ?? prev?.userSig ?? null,
        merchantSig: merchantSig ?? prev?.merchantSig ?? null,
        releasePrep: releasePrep ?? prev?.releasePrep ?? null,
      };
      window.localStorage.setItem(releaseStoreKey(id), JSON.stringify(snapshot));
    } catch {
      window.localStorage.setItem(
        releaseStoreKey(id),
        JSON.stringify({ userSig, merchantSig, releasePrep } satisfies StoredReleaseState),
      );
    }
  }, [id, userSig, merchantSig, releasePrep, mounted]);

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
      // 必须与用户侧使用同一 `releaseNonce` 的 payload；勿复用 localStorage/内存里上一轮释放的 releasePrep，否则链上会 "sig" 回滚。
      const prep = await releasePrepare(intent.intentId);
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
      await saveReleaseSignature(intent.intentId, "merchant", sig);
      await onIntentRefresh();
      const sigs = await getReleaseSignatures(intent.intentId);
      setUserSig(sigs.userSig);
      setMerchantSig(sigs.merchantSig ?? sig);
      const id = intent.intentId.trim();
      if (mounted && id) {
        try {
          const snapshot: StoredReleaseState = {
            userSig: sigs.userSig,
            merchantSig: sigs.merchantSig ?? sig,
            releasePrep: prep,
          };
          window.localStorage.setItem(releaseStoreKey(id), JSON.stringify(snapshot));
        } catch {
          // ignore
        }
      }
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
    if (releaseSubmitInFlightRef.current || releaseSubmitCooldown) return;

    setHint(null);
    releaseSubmitInFlightRef.current = true;
    setBusy("submit-release");
    try {
      const fresh = await getIntent(intent.intentId);
      if (
        fresh.releaseNonce !== intent.releaseNonce ||
        fresh.releaseCount !== intent.releaseCount ||
        fresh.releasedTotal !== intent.releasedTotal
      ) {
        setHint(text.intentStaleBeforeSubmit);
        await onIntentRefresh();
        return;
      }

      const sigs = await getReleaseSignatures(intent.intentId);
      let lsSubmit: StoredReleaseState | null = null;
      try {
        const raw = window.localStorage.getItem(releaseStoreKey(intent.intentId));
        if (raw) lsSubmit = JSON.parse(raw) as StoredReleaseState;
      } catch {
        lsSubmit = null;
      }
      const submitUserSig =
        userSig ??
        sigs.userSig ??
        (intent.userSig as `0x${string}` | undefined) ??
        lsSubmit?.userSig ??
        null;
      const submitMerchantSig =
        merchantSig ??
        sigs.merchantSig ??
        (intent.merchantSig as `0x${string}` | undefined) ??
        lsSubmit?.merchantSig ??
        null;
      if (!submitUserSig || !submitMerchantSig) {
        throw new Error(text.needBothSigs);
      }
      await releaseSubmit(intent.intentId, submitUserSig, submitMerchantSig);
      setReleaseSubmitCooldown(true);
      window.setTimeout(() => setReleaseSubmitCooldown(false), 4500);
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
      releaseSubmitInFlightRef.current = false;
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
      <div className="payfi-card space-y-3 border border-white/8 p-4 text-sm">
        <p className="text-zinc-500">{text.wrongStatus}</p>
      </div>
    );
  }

  return (
    <section className="payfi-card space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">{text.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{text.lead}</p>
      </div>

      <DualSignIntentFacts
        intent={intent}
        chainId={targetChainId}
        locale={locale}
        onRefresh={() => void onIntentRefresh()}
        labels={{
          title: text.intentFactsTitle,
          contractIntentId: text.contractIntentId,
          userAddress: text.userAddress,
          merchantAddress: text.expectedMerchant,
          releaseProgressLabel: text.releaseProgressLabel,
          escrowTotal: text.escrowTotal,
          merchantReceived: text.merchantReceived,
          userEscrowAmount: text.userEscrowAmount,
          releaseNonce: text.releaseNonce,
          refreshContract: text.refreshContract,
          userSignRole: text.userSignRole,
          merchantSignRole: text.merchantSignRole,
          pendingSign: text.pendingSign,
          timeUnknown: text.timeUnknown,
          amountsSection: text.amountsSection,
          amountUnitUsdc: text.amountUnitUsdc,
          amountUnitMock: text.amountUnitMock,
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={Boolean(busy) || onWrongChain}
          onClick={() => void onSignMerchant()}
          className="payfi-btn-primary text-xs"
        >
          {busy === "sign-merchant" ? text.signing : text.signAsMerchant}
        </button>
        <button
          type="button"
          disabled={
            Boolean(busy) ||
            releaseSubmitCooldown ||
            !displayUserSig ||
            !displayMerchantSig
          }
          onClick={() => void onSubmitRelease()}
          className="payfi-btn-primary text-xs"
        >
          {busy === "submit-release" ? text.submitting : text.submitRelease}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">{text.releaseManualNote}</p>

      {((!displayUserSig && !hint) || hint || releaseSubmitCooldown) && (
        <aside
          className="payfi-card mt-1 space-y-3 border border-amber-500/25 bg-amber-500/5 p-4"
          aria-live="polite"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
            {text.hintCardTitle}
          </h2>
          {!displayUserSig && !hint && (
            <p className="text-sm leading-relaxed text-amber-100/95">
              {intent.releaseCount > 0 ? text.nextRoundNeedResign : text.needUserSignFirst}
            </p>
          )}
          {hint && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-100/95">{hint}</p>
          )}
          {releaseSubmitCooldown && (
            <p className="text-sm leading-relaxed text-amber-100/95">{text.submitCooldownNote}</p>
          )}
        </aside>
      )}
    </section>
  );
}
