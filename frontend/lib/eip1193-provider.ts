/**
 * Wagmi `connector.getProvider()` is typed loosely; narrow to EIP-1193 `request`.
 */
export function getEip1193Request(
  provider: unknown,
): ((args: { method: string }) => Promise<unknown>) | null {
  if (
    provider &&
    typeof provider === "object" &&
    "request" in provider &&
    typeof (provider as { request?: unknown }).request === "function"
  ) {
    return (provider as { request: (args: { method: string }) => Promise<unknown> })
      .request;
  }
  return null;
}
