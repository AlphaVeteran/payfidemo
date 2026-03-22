import { decodeEventLog, getAddress, type Hex } from "viem";
import { getPublicClient } from "./config.js";
import { payFiEscrowAbi } from "../abi/payFiEscrow.js";

export type ParsedFunding = {
  escrowId: string;
  user: string;
  merchant: string;
  asset: string;
  amountTotal: bigint;
  expiresAt: number;
  agreementHash: Hex;
};

export async function parseEscrowCreatedFromReceipt(
  escrowAddress: string,
  txHash: Hex,
): Promise<ParsedFunding | null> {
  const client = getPublicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (!receipt) return null;
  const want = getAddress(escrowAddress);
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== want) continue;
    try {
      const decoded = decodeEventLog({
        abi: payFiEscrowAbi,
        eventName: "EscrowCreated",
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args as unknown as {
        id: bigint;
        user: string;
        merchant: string;
        asset: string;
        amountTotal: bigint;
        expiresAt: bigint;
        agreementHash: Hex;
      };
      return {
        escrowId: args.id.toString(),
        user: getAddress(args.user),
        merchant: getAddress(args.merchant),
        asset: getAddress(args.asset),
        amountTotal: args.amountTotal,
        expiresAt: Number(args.expiresAt),
        agreementHash: args.agreementHash,
      };
    } catch {
      continue;
    }
  }
  return null;
}
