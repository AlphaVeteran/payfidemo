import type { ReleasePrepareResponse } from "./payfi-api";

export const releaseStoreKey = (intentId: string) => `payfi.release.${intentId}`;

export type StoredReleaseState = {
  userSig: `0x${string}` | null;
  merchantSig: `0x${string}` | null;
  releasePrep: ReleasePrepareResponse | null;
};
