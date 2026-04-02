import crypto from "node:crypto";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;

  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

export function canonicalHash(obj: object): string {
  const normalized = sortKeys(obj);
  const json = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

