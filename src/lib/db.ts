import { Pool, type PoolConfig } from "pg";

let pool: Pool | null = null;

// Cap the connection pool to avoid exhausting the database connection limit.
// Override via DB_MAX_CONNECTIONS for larger instances or PgBouncer setups.
const DEFAULT_MAX_CONNECTIONS = 20;

// Postgres-side timeouts so a runaway query can't hold a connection indefinitely.
const STATEMENT_TIMEOUT_MS = 8_000;
const IDLE_IN_TXN_TIMEOUT_MS = 5_000;

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    const config: PoolConfig = {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }, // Required for Neon / Railway managed PG
      max: parseInt(process.env.DB_MAX_CONNECTIONS ?? String(DEFAULT_MAX_CONNECTIONS), 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout: IDLE_IN_TXN_TIMEOUT_MS,
    };

    pool = new Pool(config);

    pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });
  }

  return pool;
}

// Use pool.query() directly — avoids explicit client checkout/release overhead
export async function query(text: string, params?: unknown[]) {
  return getPool().query(text, params);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
