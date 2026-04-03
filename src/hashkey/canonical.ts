import { createRequire } from "node:module";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const canonicalize = require("canonicalize") as (input: unknown) => string | undefined;

/** RFC 8785-style canonical JSON (library `canonicalize`); used for cart_hash & HMAC body bytes. */
export function canonicalStringify(obj: object): string {
  const out = canonicalize(obj);
  if (typeof out !== "string") {
    throw new Error("canonicalize failed for payload");
  }
  return out;
}

export function canonicalHash(obj: object): string {
  return crypto.createHash("sha256").update(canonicalStringify(obj), "utf8").digest("hex");
}
