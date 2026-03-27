import type { TypedDataDomain } from "viem";

/** Align API JSON message with viem EIP-712 uint256 fields. */
export function releaseMessageFromApi(message: Record<string, unknown>) {
  return {
    escrowId: BigInt(String(message.escrowId)),
    nonce: BigInt(String(message.nonce)),
    amount: BigInt(String(message.amount)),
    merchant: message.merchant as `0x${string}`,
    agreementHash: message.agreementHash as `0x${string}`,
  };
}

export function domainFromApi(
  raw: Record<string, unknown>,
): TypedDataDomain {
  const chainId = raw.chainId;
  return {
    name: raw.name as string,
    version: raw.version as string,
    chainId:
      typeof chainId === "bigint"
        ? Number(chainId)
        : Number(chainId as string | number),
    verifyingContract: raw.verifyingContract as `0x${string}`,
  };
}
