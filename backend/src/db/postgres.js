/**
 * Postgres connection helper (single shared pool).
 *
 * Used when DATABASE_URL is set (e.g. a Supabase/RDS/Neon instance) — both the RepoWiki and
 * CodeGraph stores share one pool. Remote hosts get TLS with relaxed cert verification because
 * managed poolers (Supabase's pgBouncer in particular) present certificates that Node's default
 * CA bundle can't verify; local Postgres skips TLS.
 */
import pg from 'pg';
import { logger } from '../logger.js';

let pool = null;

/** Lazily create (or reuse) the shared pool for `connectionString`. */
export function getPool(connectionString) {
  if (pool) return pool;

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  pool = new pg.Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
  });
  // Pool-level errors (dropped connections etc.) must not crash the process.
  pool.on('error', (err) => logger.error(`Postgres pool error: ${err.message}`));
  return pool;
}

/** Close the shared pool (graceful shutdown). Idempotent. */
export async function closePool() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

export default getPool;
