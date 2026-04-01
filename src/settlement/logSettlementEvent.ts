import { safeJsonStringify } from "../util/safeJson.js";
import type { SettlementEventKind } from "./settlementPort.js";

export function logSettlementEvent(kind: SettlementEventKind, payload: unknown): void {
  console.log(`[SettlementOutbox] ${kind}`, safeJsonStringify(payload));
}
