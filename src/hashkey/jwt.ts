import crypto from "node:crypto";
import fs from "node:fs";
import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import { canonicalHash } from "./canonical.js";

export async function buildMerchantJWT(cartContents: object): Promise<string> {
  const merchantName = process.env.MERCHANT_NAME?.trim();
  const pemPath = process.env.MERCHANT_PRIVATE_KEY_PATH?.trim();
  if (!merchantName) throw new Error("MERCHANT_NAME is required");
  if (!pemPath) throw new Error("MERCHANT_PRIVATE_KEY_PATH is required");

  const pem = fs.readFileSync(pemPath, "utf8");
  const privateKey = createPrivateKey(pem);

  const cartHash = canonicalHash(cartContents);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    iss: merchantName,
    sub: merchantName,
    aud: "HashkeyMerchant",
    iat: now,
    exp: now + 3600,
    jti: `JWT-${now}-${crypto.randomUUID()}`,
    cart_hash: cartHash,
  })
    .setProtectedHeader({ alg: "ES256K", typ: "JWT" })
    .sign(privateKey);
}

