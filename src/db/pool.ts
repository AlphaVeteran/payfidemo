import pg from "pg";

let pool: pg.Pool | null = null;
let warnedBadDatabaseUrl = false;

function rawDatabaseUrl(): string | undefined {
  const u = process.env.DATABASE_URL?.trim();
  return u || undefined;
}

function logBadDatabaseUrlOnce(message: string): void {
  if (warnedBadDatabaseUrl) return;
  warnedBadDatabaseUrl = true;
  console.error(`[payfidemo] ${message}`);
}

/** 可解析且 host 合理才启用 Postgres；占位 host「base」等视为未配置，避免 pg ENOTFOUND 导致进程退出。 */
function databaseUrlLooksUsable(raw: string | undefined): raw is string {
  if (!raw) return false;
  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    logBadDatabaseUrlOnce(
      "DATABASE_URL is not a valid URL (if it contains & wrap the whole value in quotes in Railway). Using in-memory intent store.",
    );
    return false;
  }
  if (!hostname || hostname === "base") {
    logBadDatabaseUrlOnce(
      `DATABASE_URL hostname "${hostname || ""}" is invalid — often a mistyped Railway reference (e.g. wrong \${{Service.DATABASE_URL}}). ` +
        "Paste a full postgres URL or remove DATABASE_URL. Using in-memory intent store.",
    );
    return false;
  }
  return true;
}

export function isPersistenceEnabled(): boolean {
  return databaseUrlLooksUsable(rawDatabaseUrl());
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
  const raw = rawDatabaseUrl();
  if (!databaseUrlLooksUsable(raw)) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: raw,
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
