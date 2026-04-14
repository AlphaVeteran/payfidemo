import type { IntentRecord } from "@/lib/payfi-api";

/** 托管剩余（总额 − 已释放给商家），与链上 escrow 用户侧剩余一致。 */
export function userEscrowRemainder(intent: IntentRecord): string {
  try {
    const total = BigInt(intent.amountTotal);
    const released = BigInt(intent.releasedTotal);
    return total > released ? (total - released).toString() : "0";
  } catch {
    return "0";
  }
}
