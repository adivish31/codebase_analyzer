/**
 * CodeGraph DB — Postgres implementation.
 *
 * Same interface as the SQLite CodeGraphStore (db/codeGraphStore.js); selected by the store
 * factory (db/index.js) when DATABASE_URL is set. Tables are prefixed `codegraph_`.
 */
import { getPool, closePool } from './postgres.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS codegraph_files (
  rel_path TEXT PRIMARY KEY,
  language TEXT
);
CREATE TABLE IF NOT EXISTS codegraph_symbols (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name     TEXT,
  kind     TEXT,
  rel_path TEXT,
  line     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_codegraph_symbols_name ON codegraph_symbols(name);
CREATE INDEX IF NOT EXISTS idx_codegraph_symbols_path ON codegraph_symbols(rel_path);
CREATE TABLE IF NOT EXISTS codegraph_edges (
  from_path TEXT,
  to_path   TEXT,
  kind      TEXT
);
CREATE INDEX IF NOT EXISTS idx_codegraph_edges_from ON codegraph_edges(from_path);
CREATE INDEX IF NOT EXISTS idx_codegraph_edges_to   ON codegraph_edges(to_path);
`;

const INSERT_BATCH = 200;

export class PgCodeGraphStore {
  constructor(pool) {
    this.pool = pool;
  }

  static async open(connectionString) {
    const pool = getPool(connectionString);
    await pool.query(SCHEMA);
    return new PgCodeGraphStore(pool);
  }

  async reset() {
    await this.pool.query('TRUNCATE codegraph_files, codegraph_symbols, codegraph_edges RESTART IDENTITY');
  }

  async close() {
    await closePool();
  }

  // --- writes (bulk, transactional) ----------------------------------------
  async insertFiles(files) {
    await this.#batchInsert(
      'INSERT INTO codegraph_files (rel_path, language) VALUES %V ' +
        'ON CONFLICT (rel_path) DO UPDATE SET language = EXCLUDED.language',
      files.map((f) => [f.relPath, f.language])
    );
  }

  async insertSymbols(symbols) {
    await this.#batchInsert(
      'INSERT INTO codegraph_symbols (name, kind, rel_path, line) VALUES %V',
      symbols.map((s) => [s.name, s.kind, s.relPath, s.line])
    );
  }

  async insertEdges(edges) {
    await this.#batchInsert(
      'INSERT INTO codegraph_edges (from_path, to_path, kind) VALUES %V',
      edges.map((e) => [e.from, e.to, e.kind || 'import'])
    );
  }

  // --- queries --------------------------------------------------------------

  /** Find where a symbol is defined (case-insensitive, partial match supported). */
  async findSymbol(name, { exact = false, limit = 25 } = {}) {
    if (exact) {
      const { rows } = await this.pool.query(
        'SELECT name, kind, rel_path AS "relPath", line FROM codegraph_symbols WHERE name = $1 LIMIT $2',
        [name, limit]
      );
      return rows;
    }
    const { rows } = await this.pool.query(
      `SELECT name, kind, rel_path AS "relPath", line FROM codegraph_symbols
       WHERE name ILIKE $1 ORDER BY name LIMIT $2`,
      [`%${name}%`, limit]
    );
    return rows;
  }

  /** Files that import `relPath` (i.e. who depends on it). */
  async dependentsOf(relPath) {
    const { rows } = await this.pool.query(
      'SELECT DISTINCT from_path AS "relPath" FROM codegraph_edges WHERE to_path = $1 ORDER BY from_path',
      [relPath]
    );
    return rows.map((r) => r.relPath);
  }

  /** Files that `relPath` imports (its dependencies). */
  async dependenciesOf(relPath) {
    const { rows } = await this.pool.query(
      'SELECT DISTINCT to_path AS "relPath" FROM codegraph_edges WHERE from_path = $1 ORDER BY to_path',
      [relPath]
    );
    return rows.map((r) => r.relPath);
  }

  /** Whole graph for visualization (capped). */
  async getGraph(limit = 300) {
    const { rows: nodes } = await this.pool.query(
      'SELECT rel_path AS "relPath", language FROM codegraph_files LIMIT $1',
      [limit]
    );
    const nodeSet = new Set(nodes.map((n) => n.relPath));
    const { rows: allEdges } = await this.pool.query(
      'SELECT from_path AS "from", to_path AS "to", kind FROM codegraph_edges'
    );
    const edges = allEdges.filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to));
    return { nodes, edges };
  }

  /** Symbols declared in one file. */
  async symbolsIn(relPath) {
    const { rows } = await this.pool.query(
      'SELECT name, kind, line FROM codegraph_symbols WHERE rel_path = $1 ORDER BY line',
      [relPath]
    );
    return rows;
  }

  async counts() {
    const { rows } = await this.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM codegraph_files)::int   AS files,
         (SELECT COUNT(*) FROM codegraph_symbols)::int AS symbols,
         (SELECT COUNT(*) FROM codegraph_edges)::int   AS edges`
    );
    return rows[0];
  }

  // --- helpers --------------------------------------------------------------

  /** Multi-row INSERT in batches inside one transaction (see PgRepoWikiStore.#batchInsert). */
  async #batchInsert(sql, rows) {
    if (rows.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const batch = rows.slice(i, i + INSERT_BATCH);
        const width = batch[0].length;
        const values = batch
          .map((_, r) => `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(',')})`)
          .join(',');
        await client.query(sql.replace('%V', values), batch.flat());
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export default PgCodeGraphStore;
