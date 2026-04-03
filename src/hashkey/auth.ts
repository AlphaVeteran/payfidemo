import crypto from "node:crypto";

export function buildHmacHeaders(params: {
  method: string;
  path: string;
  query?: string;
  body?: string;
  appKey: string;
  appSecret: string;
}) {
  const { method, path, appKey, appSecret } = params;
  const query = params.query ?? "";
  const body = params.body ?? "";

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  // Per HashKey docs: bodyHash = hex(SHA256(UTF-8 bytes of canonical JSON string)).
  // Caller must pass the exact wire body (canonical JSON); we hash those bytes.
  const bodyHash = body
    ? crypto.createHash("sha256").update(body, "utf8").digest("hex")
    : "";
  // message format: method \n path \n query \n bodyHash \n timestamp \n nonce
  const message = [method, path, query, bodyHash, timestamp, nonce].join("\n");

  const signature = crypto.createHmac("sha256", appSecret).update(message).digest("hex");

  return {
    "X-App-Key": appKey,
    "X-Signature": signature,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "Content-Type": "application/json",
  };
}

