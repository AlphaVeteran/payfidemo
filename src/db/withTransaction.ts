import type { PoolClient } from "pg";
import { getPgPool } from "./pool.js";

/** 单连接事务；调用方需已配置 DATABASE_URL。 */
export async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  if (!pool) throw new Error("withPgTransaction requires DATABASE_URL");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
