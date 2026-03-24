/** JSON.stringify that tolerates BigInt (and avoids crashing the process on log lines). */
export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return "[unserializable]";
  }
}
