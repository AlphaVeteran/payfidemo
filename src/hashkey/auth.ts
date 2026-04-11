import crypto from "node:crypto";

/** 参与 HMAC 的 query 段：不含前导 `?`，与多数网关「验签用 queryString」一致。 */
function queryForSignature(query: string): string {
  const q = query.trim();
  return q.startsWith("?") ? q.slice(1) : q;
}

export function buildHmacHeaders(params: {
  method: string;
  path: string;
  query?: string;
  body?: string;
  appKey: string;
  appSecret: string;
}) {
  const { path, appKey, appSecret } = params;
  const method = params.method.trim().toUpperCase();
  const query = queryForSignature(params.query ?? "");
  const body = params.body ?? "";

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  // Per HashKey docs: bodyHash = hex(SHA256(UTF-8 bytes of canonical JSON string)).
  // Caller must pass the exact wire body (canonical JSON); we hash those bytes.
  const bodyHash = body
    ? crypto.createHash("sha256").update(body, "utf8").digest("hex")
    : "";
  // message format: METHOD \n path \n query \n bodyHash \n timestamp \n nonce
  const message = [method, path, query, bodyHash, timestamp, nonce].join("\n");

  const signature = crypto.createHmac("sha256", appSecret).update(message).digest("hex");

  const m = method;
  const headers: Record<string, string> = {
    "X-App-Key": appKey,
    "X-Signature": signature,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
  };
  if (m !== "GET" && m !== "HEAD") {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

