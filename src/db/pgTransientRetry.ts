/**
 * Neon / pooled Postgres often closes idle TLS sockets; the next checkout may fail with
 * ECONNRESET until a fresh connection is used. One retry covers most cases.
 */
export function isTransientPgConnectionError(e: unknown): boolean {
  const er = e as NodeJS.ErrnoException & { code?: string };
  const c = er?.code;
  return (
    c === "ECONNRESET" ||
    c === "EPIPE" ||
    c === "ETIMEDOUT" ||
    c === "ECONNREFUSED" ||
    c === "ECONNABORTED"
  );
}

export async function withPgTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isTransientPgConnectionError(e)) throw e;
    return await fn();
  }
}
