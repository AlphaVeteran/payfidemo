import pg from "pg";

let pool: pg.Pool | null = null;

export function isPersistenceEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
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
