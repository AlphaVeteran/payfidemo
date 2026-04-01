import { appendSettlementOutbox } from "./settlementOutbox.js";
import { logSettlementEvent } from "./logSettlementEvent.js";
import type { SettlementEventKind, SettlementPort } from "./settlementPort.js";

/** Default demo adapter: writes to {@link appendSettlementOutbox} and logs. */
export class MockSettlementAdapter implements SettlementPort {
  async emit(kind: SettlementEventKind, payload: unknown): Promise<string> {
    const id = await appendSettlementOutbox(kind, payload);
    logSettlementEvent(kind, payload);
    return id;
  }
}

export const settlementAdapter: SettlementPort = new MockSettlementAdapter();
