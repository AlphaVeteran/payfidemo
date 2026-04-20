export type IntentStatus =
  | "draft"
  | "awaiting_funding"
  | "active"
  | "partially_settled"
  | "settled"
  | "refunded"
  | "expired";

export interface AgreementAnchor {
  agreementHash: `0x${string}`;
  termsVersion: string;
  termsUri?: string;
  jurisdiction?: string;
  disputeResolver?: string;
}

export interface IntentRecord {
  intentId: string;
  merchant: string;
  user: string;
  asset: string;
  amountTotal: string;
  amountPerLesson: string;
  maxReleases: number;
  durationSeconds: number;
  webhookUrl?: string;
  webhookSecret?: string;
  anchor: AgreementAnchor;
  status: IntentStatus;
  escrowId: string | null;
  fundingTxHash: string | null;
  releaseCount: number;
  releasedTotal: string;
  expiresAt: number | null;
  releaseNonce: number;
  createdAt: string;
  paymentUrl?: string;
  hskPaymentReqId?: string;
  hskCartMandateId?: string;
  userSig?: string;
  merchantSig?: string;
  /** ISO 8601：服务端在保存对应角色签名时写入；清空签名时一并清除 */
  userSigAt?: string;
  merchantSigAt?: string;
}

export interface CreateIntentBody {
  merchant: string;
  user: string;
  asset: string;
  /** Optional client-side decimals hint for server-side sanity check */
  assetDecimals?: number;
  amountTotal: string;
  amountPerLesson: string;
  maxReleases: number;
  durationSeconds: number;
  webhookUrl?: string;
  webhookSecret?: string;
  agreementHash: `0x${string}`;
  termsVersion: string;
  termsUri?: string;
  jurisdiction?: string;
  disputeResolver?: string;
}

export interface CoreIntentLinkRecord {
  coreOrderId: string;
  escrowId: string;
  intentId?: string;
  mappedTxHash?: string;
  createdAt: string;
  updatedAt: string;
}
