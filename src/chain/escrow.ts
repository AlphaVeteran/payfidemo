import {
  getAddress,
  isAddress,
  isHash,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";
import type { IntentRecord } from "../types.js";
import { payFiEscrowAbi } from "../abi/payFiEscrow.js";
import { getPublicClient, getSubmitterWallet } from "./config.js";

export async function registerEscrowOnChain(intent: IntentRecord, txHash: string): Promise<string> {
  if (!isHash(txHash)) throw new Error("invalid funding tx hash");
  const escrowAddrRaw = process.env.ESCROW_ADDRESS?.trim();
  if (!escrowAddrRaw || !isAddress(escrowAddrRaw)) {
    throw new Error("ESCROW_ADDRESS is required");
  }
  const escrowAddress = getAddress(escrowAddrRaw);

  const escrowIdHex = keccak256(toBytes(intent.intentId));
  const escrowId = BigInt(escrowIdHex);
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = BigInt((intent.expiresAt ?? nowSec + intent.durationSeconds) as number);
  const disputeModule = intent.anchor.disputeResolver && isAddress(intent.anchor.disputeResolver)
    ? getAddress(intent.anchor.disputeResolver)
    : zeroAddress;

  const wallet = getSubmitterWallet();
  const hash = await wallet.writeContract({
    address: escrowAddress,
    abi: payFiEscrowAbi,
    functionName: "registerDeposit",
    args: [
      escrowId,
      getAddress(intent.user),
      getAddress(intent.merchant),
      getAddress(intent.asset),
      BigInt(intent.amountTotal),
      BigInt(intent.amountPerLesson),
      intent.maxReleases,
      expiresAt,
      intent.anchor.agreementHash,
      disputeModule,
    ],
  });
  await getPublicClient().waitForTransactionReceipt({ hash });
  return escrowId.toString();
}
