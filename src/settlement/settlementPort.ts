/**
 * Pluggable settlement messaging: domain events leave the app through a
 * {@link SettlementPort}. Implementations can be in-memory (demo), HTTP
 * (e.g. compatible with HashKey Settlement Protocol), etc.
 */
export type SettlementEventKind =
  | "INTENT_CREATED"
  | "INTENT_FUNDED"
  | "SETTLEMENT_RELEASED"
  | "INTENT_REFUNDED";

export type SettlementOutboxRecord = {
  id: string;
  kind: SettlementEventKind;
  payload: unknown;
  createdAt: string;
};

export interface SettlementPort {
  emit(kind: SettlementEventKind, payload: unknown): Promise<string>;
}
