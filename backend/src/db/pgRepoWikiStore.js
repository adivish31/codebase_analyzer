/**
 * RepoWiki DB — Postgres implementation.
 *
 * Same interface as the SQLite RepoWikiStore (db/repoWikiStore.js); selected by the store factory
 * (db/index.js) when DATABASE_URL is set. Tables are prefixed `repowiki_` so both logical DBs live
 * comfortably in one Postgres database. Vectors are stored as JSON text, exactly like the SQLite
 * store — the in-memory VectorStore does the searching either way.
 */
import { getPool, closePool } from './postgres.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS repowiki_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS repowiki_files (
  rel_path   TEXT PRIMARY KEY,
  language   TEXT,
  line_count INTEGER
);
CREATE TABLE IF NOT EXISTS repowiki_chunks (
  id         TEXT PRIMARY KEY,
  rel_path   TEXT,
  language   TEXT,
  start_line INTEGER,
  end_line   INTEGER,
  text       TEXT,
  vector     TEXT
);
CREATE INDEX IF NOT EXISTS idx_repowiki_chunks_path ON repowiki_chunks(rel_path);
CREATE TABLE IF NOT EXISTS repowiki_wiki (
  rel_path   TEXT PRIMARY KEY,
  language   TEXT,
  summary    TEXT,
  symbols    TEXT,
  updated_at TEXT
);
`;

/** Rows per multi-row INSERT (7 params each — well under pg's 65535-parameter cap). */
const INSERT_BATCH = 200;

export class PgRepoWikiStore {
  constructor(pool) {
    this.pool = pool;
  }

  static async open(connectionString) {
    const pool = getPool(connectionString);
    await pool.query(SCHEMA);
    return new PgRepoWikiStore(pool);
  }

  async reset() {
    await this.pool.query('TRUNCATE repowiki_meta, repowiki_files, repowiki_chunks, repowiki_wiki');
  }

  async close() {
    await closePool();
  }

  // --- meta -----------------------------------------------------------------
  async saveMeta(meta) {
    await this.pool.query(
      `INSERT INTO repowiki_meta (key, value) VALUES ('codebase', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(meta)]
    );
  }

  async getMeta() {
    const { rows } = await this.pool.query("SELECT value FROM repowiki_meta WHERE key = 'codebase'");
    return rows[0] ? JSON.parse(rows[0].value) : null;
  }

  // --- files ----------------------------------------------------------------
  async insertFiles(files) {
    await this.#batchInsert(
      'INSERT INTO repowiki_files (rel_path, language, line_count) VALUES %V ' +
        'ON CONFLICT (rel_path) DO UPDATE SET language = EXCLUDED.language, line_count = EXCLUDED.line_count',
      files.map((f) => [f.relPath, f.language, f.lineCount || 0])
    );
  }

  // --- chunks (with vectors) ------------------------------------------------
  async insertChunks(records) {
    await this.#batchInsert(
      'INSERT INTO repowiki_chunks (id, rel_path, language, start_line, end_line, text, vector) VALUES %V ' +
        'ON CONFLICT (id) DO NOTHING',
      records.map((r) => [
        r.id,
        r.metadata.relPath,
        r.metadata.language,
        r.metadata.startLine,
        r.metadata.endLine,
        r.metadata.text,
        JSON.stringify(r.vector),
      ])
    );
  }

  /** Return all chunks as VectorStore records: { id, vector, metadata }. */
  async allChunks() {
    const { rows } = await this.pool.query('SELECT * FROM repowiki_chunks');
    return rows.map((row) => ({
      id: row.id,
      vector: JSON.parse(row.vector),
      metadata: {
        relPath: row.rel_path,
        language: row.language,
        startLine: row.start_line,
        endLine: row.end_line,
        text: row.text,
      },
    }));
  }

  // --- wiki -----------------------------------------------------------------
  async upsertWiki(entry) {
    await this.pool.query(
      `INSERT INTO repowiki_wiki (rel_path, language, summary, symbols, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (rel_path) DO UPDATE SET
         language = EXCLUDED.language, summary = EXCLUDED.summary,
         symbols = EXCLUDED.symbols, updated_at = EXCLUDED.updated_at`,
      [entry.relPath, entry.language, entry.summary, JSON.stringify(entry.symbols || []), new Date().toISOString()]
    );
  }

  async getWiki(relPath) {
    const { rows } = await this.pool.query('SELECT * FROM repowiki_wiki WHERE rel_path = $1', [relPath]);
    return rows[0] ? this.#wikiRow(rows[0]) : null;
  }

  async listWiki() {
    const { rows } = await this.pool.query('SELECT * FROM repowiki_wiki ORDER BY rel_path');
    return rows.map((r) => this.#wikiRow(r));
  }

  #wikiRow(row) {
    return {
      relPath: row.rel_path,
      language: row.language,
      summary: row.summary,
      symbols: JSON.parse(row.symbols || '[]'),
      updatedAt: row.updated_at,
    };
  }

  // --- helpers --------------------------------------------------------------

  /**
   * Multi-row INSERT in batches inside one transaction. `sql` contains a %V placeholder that is
   * expanded to ($1,$2,...),(...) groups matching each row's length.
   */
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

export default PgRepoWikiStore;
