import pg from "pg";

let pool: pg.Pool | null = null;

/** 在创建 Pool 前校验，避免把明显错误的连接串（如 host=base）带进 pg 只得到 ENOTFOUND。 */
export function assertDatabaseConnectionString(): void {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return;
  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    throw new Error(
      "[payfidemo] DATABASE_URL is not a valid URL. If the value contains & wrap the whole string in quotes in Railway Variables.",
    );
  }
  if (!hostname || hostname === "base") {
    throw new Error(
      '[payfidemo] DATABASE_URL has invalid host (e.g. "base"). ' +
        "Usually a mistyped Railway reference or placeholder. " +
        "Paste the full postgres URL from Neon / Railway Postgres, or use ${{YourPostgresServiceName.DATABASE_URL}} with the exact service name. " +
        "To run without DB, remove DATABASE_URL (API uses in-memory intents).",
    );
  }
}

export function isPersistenceEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** 供 /health 展示的数据库产品名（不暴露连接串）。与当前实现一致时多为 PostgreSQL。 */
export function getDatabaseProductLabel(): string | null {
  if (!isPersistenceEnabled()) return null;
  const u = process.env.DATABASE_URL!.trim().toLowerCase();
  if (u.startsWith("mysql://") || u.startsWith("mariadb://")) return "MySQL";
  if (u.startsWith("postgres://") || u.startsWith("postgresql://")) return "PostgreSQL";
  return "PostgreSQL";
}

export function getPgPool(): pg.Pool | null {
  if (!isPersistenceEnabled()) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL!.trim(),
      max: 10,
    });
  }
  return pool;
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
