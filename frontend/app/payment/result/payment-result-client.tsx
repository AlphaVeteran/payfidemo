"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGatewayReconciliation, postFundingTx } from "@/lib/payfi-api";
import {
  normalizeLooseTxHash,
  pickTxHashFromSearchParams,
} from "@/lib/payment-result-tx";

type Phase =
  | "idle"
  | "resolving"
  | "submitting"
  | "success"
  | "error"
  | "missing";

export default function PaymentResultClient() {
  const searchParams = useSearchParams();
  const intentId = searchParams.get("intentId")?.trim() ?? "";
  const txFromUrl = pickTxHashFromSearchParams(searchParams);
  const [resolvedTxHash, setResolvedTxHash] = useState<`0x${string}` | null>(null);

  const effectiveTx = useMemo(
    () => txFromUrl ?? resolvedTxHash,
    [txFromUrl, resolvedTxHash],
  );

  const onceRef = useRef(false);
  const lastKeyRef = useRef<string>("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setResolvedTxHash(null);
  }, [intentId]);

  /** 回跳 URL 无 tx 时：向服务端拉取 HashKey GET /payments 对账结果，解析链上哈希或确认已登记。 */
  useEffect(() => {
    if (!intentId || txFromUrl) return;

    let cancelled = false;
    setPhase("resolving");
    setMessage(null);

    void (async () => {
      try {
        const gr = await getGatewayReconciliation(intentId);
        if (cancelled) return;

        const localFunded = normalizeLooseTxHash(gr.local.fundingTxHash ?? null);
        if (localFunded) {
          setPhase("success");
          setMessage("托管入金已在系统中登记。");
          return;
        }

        const fromGateway = normalizeLooseTxHash(
          gr.reconciliation.gatewayTxSignature ?? null,
        );
        if (fromGateway) {
          setResolvedTxHash(fromGateway);
          return;
        }

        setPhase("missing");
        setMessage(
          "回跳链接未携带交易哈希，且商户网关对账接口暂未返回链上哈希（可能支付尚未入账或需稍后重试）。请到用户工作台使用「登记托管入金」粘贴 Blockscout 上的交易哈希。",
        );
      } catch (e) {
        if (cancelled) return;
        const detail = e instanceof Error ? e.message : String(e);
        setPhase("missing");
        setMessage(
          `无法从商户网关解析交易（${detail}）。若本笔意向未走 HashKey 收银台，属预期。请到用户工作台手动登记 Blockscout 上的交易哈希。`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [intentId, txFromUrl]);

  useEffect(() => {
    if (!intentId) {
      setPhase("missing");
      setMessage(
        "回跳地址缺少 intentId 参数。请从用户工作台重新打开收银台，或手动登记托管入金。",
      );
      return;
    }

    if (!effectiveTx) return;

    const key = `${intentId}|${effectiveTx}`;
    if (lastKeyRef.current !== key) {
      lastKeyRef.current = key;
      onceRef.current = false;
    }

    const sessionKey = `payfi:auto-funding:${intentId}:${effectiveTx}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(sessionKey) === "1") {
      setPhase("success");
      setMessage("托管入金此前已在该浏览器登记。");
      return;
    }

    if (onceRef.current) return;
    onceRef.current = true;
    setPhase("submitting");
    setMessage(null);

    void (async () => {
      try {
        await postFundingTx(intentId, effectiveTx);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(sessionKey, "1");
        }
        setPhase("success");
        setMessage("托管入金已登记。可返回用户工作台继续流程。");
      } catch (e) {
        onceRef.current = false;
        setPhase("error");
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [intentId, effectiveTx]);

  const userWorkbenchHref = intentId
    ? `/user?intentId=${encodeURIComponent(intentId)}`
    : "/user";

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="payfi-card space-y-4 p-6">
        <h1 className="text-lg font-semibold text-zinc-100">支付回跳 · 托管入金登记</h1>

        {intentId ? (
          <p className="break-all font-mono text-[11px] text-zinc-500">
            intentId: <span className="text-zinc-300">{intentId}</span>
          </p>
        ) : null}

        {phase === "resolving" && (
          <p className="text-sm text-zinc-400">正在从商户网关查询链上交易哈希…</p>
        )}

        {phase === "submitting" && <p className="text-sm text-zinc-400">正在登记托管入金…</p>}

        {phase === "success" && (
          <p className="text-sm text-emerald-200/95">{message}</p>
        )}

        {(phase === "error" || phase === "missing") && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-100/95">{message}</p>
        )}

        {effectiveTx ? (
          <p className="break-all font-mono text-[11px] text-zinc-500">
            tx: <span className="text-zinc-400">{effectiveTx}</span>
            {!txFromUrl && resolvedTxHash ? (
              <span className="ml-2 text-zinc-600">（来自网关对账）</span>
            ) : null}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <Link href={userWorkbenchHref} className="payfi-btn-primary inline-flex no-underline">
            返回用户工作台
          </Link>
          <Link href="/" className="payfi-btn-secondary inline-flex no-underline">
            首页
          </Link>
        </div>
      </div>
    </main>
  );
}
