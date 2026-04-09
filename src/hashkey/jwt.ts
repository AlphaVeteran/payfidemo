import crypto from "node:crypto";
import fs from "node:fs";
import { createPrivateKey } from "node:crypto";
import ecdsaSigFormatter from "ecdsa-sig-formatter";
import { canonicalHash } from "./canonical.js";

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function buildMerchantJWT(cartContents: object): Promise<string> {
  const merchantName = process.env.MERCHANT_NAME?.trim();
  const pemInline = process.env.MERCHANT_PRIVATE_KEY_PEM?.trim();
  const pemPath = process.env.MERCHANT_PRIVATE_KEY_PATH?.trim();
  const jwtAudience = process.env.HASHKEY_JWT_AUD?.trim() || "hgatepay";
  if (!merchantName) throw new Error("MERCHANT_NAME is required");
  if (!pemInline && !pemPath) {
    throw new Error("MERCHANT_PRIVATE_KEY_PEM or MERCHANT_PRIVATE_KEY_PATH is required");
  }

  const privateKeyPemRaw = pemInline ? pemInline : fs.readFileSync(pemPath!, "utf8").trim();
  // Cloud env vars commonly store PEM with escaped newlines ("\n").
  const privateKeyPem = privateKeyPemRaw.replace(/\\n/g, "\n");
  const privateKey = createPrivateKey(privateKeyPem);

  const cartHash = canonicalHash(cartContents);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: merchantName,
    sub: merchantName,
    aud: jwtAudience,
    iat: now,
    exp: now + 3600,
    jti: `JWT-${now}-${crypto.randomUUID()}`,
    cart_hash: cartHash,
  };

  const header = { alg: "ES256K", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const derSig = crypto.sign("sha256", Buffer.from(signingInput, "utf8"), {
    key: privateKey,
    dsaEncoding: "der",
  });
  // secp256k1: JOSE encoding matches ES256 (32-byte r | 32-byte s) after DER decode.
  const joseSigB64 = ecdsaSigFormatter.derToJose(derSig, "ES256");
  return `${signingInput}.${joseSigB64}`;
}
