/**
 * SQLite connection helper (built on Node's built-in `node:sqlite` — zero external deps).
 *
 * `node:sqlite` ships with Node 22.5+ (stable enough to use in Node 24). It is currently flagged
 * "experimental", which only means the API surface may change — it is fully functional. We suppress
 * just that one experimental warning so logs stay clean, without hiding any other warnings.
 *
 * Exposes `openDatabase(filePath)` returning a `DatabaseSync` instance with sane pragmas
 * (WAL journal for concurrent reads, foreign keys on).
 */
import fs from 'node:fs';
import path from 'node:path';

// --- Suppress ONLY the "SQLite is experimental" warning (must run before first DB construction) ---
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  const message = typeof warning === 'string' ? warning : warning?.message;
  if (message && message.includes('SQLite is an experimental feature')) return;
  return originalEmitWarning.call(process, warning, ...args);
};

// node:sqlite is imported dynamically inside openDatabase so the warning patch above is guaranteed
// to be installed first, and so a Node version without node:sqlite fails with a clear message.
let DatabaseSync = null;

async function loadDriver() {
  if (DatabaseSync) return DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
    return DatabaseSync;
  } catch (err) {
    throw new Error(
      'node:sqlite is unavailable. Use Node 22.5+ (Node 24 recommended), or set PERSIST=false. ' +
        `Original error: ${err.message}`
    );
  }
}

/**
 * Open (creating if needed) a SQLite database at `filePath`.
 * @param {string} filePath
 * @returns {Promise<import('node:sqlite').DatabaseSync>}
 */
export async function openDatabase(filePath) {
  const Driver = await loadDriver();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Driver(filePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

export default openDatabase;
