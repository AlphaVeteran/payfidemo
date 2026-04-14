import pg from "pg";

let pool: pg.Pool | null = null;

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
