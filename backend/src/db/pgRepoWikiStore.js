/**
 * RepoWiki DB — Postgres implementation, with pgvector ANN search when available.
 *
 * Same interface as the SQLite RepoWikiStore (db/repoWikiStore.js); selected by the store factory
 * (db/index.js) when DATABASE_URL is set. Tables are prefixed `repowiki_` so both logical DBs live
 * comfortably in one Postgres database.
 *
 * Embeddings:
 *   - pgvector present  → chunks carry an `embedding vector(dim)` column with an HNSW cosine
 *     index; similarity search runs IN the database (searchChunks) and chunks never need to be
 *     loaded into Node's memory. The column is re-typed to the active provider's dimension on
 *     each ingest (the table is always freshly reset first).
 *   - pgvector missing  → embeddings are stored as JSON text (like SQLite) and search falls back
 *     to the in-memory index (MemoryChunkIndex), loaded via allChunks() at startup.
 */
import { getPool, closePool } from './postgres.js';
import { logger } from '../logger.js';

const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS repowiki_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS repowiki_files (
  rel_path   TEXT PRIMARY KEY,
  language   TEXT,
  line_count INTEGER
);
CREATE TABLE IF NOT EXISTS repowiki_wiki (
  rel_path   TEXT PRIMARY KEY,
  language   TEXT,
  summary    TEXT,
  symbols    TEXT,
  updated_at TEXT
);
`;

// CREATE TABLE IF NOT EXISTS never upgrades an existing table, so a DB created by an older build
// can be missing columns. The chunks table is fully managed by #ensureChunksSchema (mode-aware
// drop/recreate); these idempotent ALTERs cover the remaining tables.
const MIGRATIONS = `
ALTER TABLE repowiki_files  ADD COLUMN IF NOT EXISTS line_count INTEGER;
ALTER TABLE repowiki_wiki   ADD COLUMN IF NOT EXISTS symbols    TEXT;
ALTER TABLE repowiki_wiki   ADD COLUMN IF NOT EXISTS updated_at TEXT;
`;

/** Rows per multi-row INSERT (7 params each — well under pg's 65535-parameter cap). */
const INSERT_BATCH = 200;
const EMBEDDING_INDEX = 'idx_repowiki_chunks_embedding';

/** Serialise a number[] into pgvector's text literal: "[0.1,0.2,...]". */
const toVectorLiteral = (vec) => `[${vec.join(',')}]`;

export class PgRepoWikiStore {
  constructor(pool, hasPgvector) {
    this.pool = pool;
    this.hasPgvector = hasPgvector;
  }

  static async open(connectionString) {
    const pool = getPool(connectionString);

    // pgvector is optional: present on Supabase/Neon/RDS-with-extension; absent on plain PG.
    let hasPgvector = true;
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (err) {
      hasPgvector = false;
      logger.warn(`pgvector unavailable (${err.message}) — falling back to in-memory search.`);
    }

    await pool.query(BASE_SCHEMA);
    await pool.query(MIGRATIONS); // upgrade legacy files/wiki tables in place
    const store = new PgRepoWikiStore(pool, hasPgvector);
    await store.#ensureChunksSchema();
    return store;
  }

  /**
   * Make sure repowiki_chunks matches the active mode (embedding vector vs JSON text column).
   * A mismatched legacy table is dropped — chunk data is always rebuildable via /api/ingest.
   */
  async #ensureChunksSchema() {
    const { rows } = await this.pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'repowiki_chunks'`
    );
    if (rows.length > 0) {
      const cols = new Set(rows.map((r) => r.column_name));
      const matches = this.hasPgvector ? cols.has('embedding') : cols.has('vector');
      if (!matches) {
        logger.warn('repowiki_chunks schema is from a different mode — recreating (re-ingest needed).');
        await this.pool.query('DROP TABLE repowiki_chunks');
      }
    }
    const embeddingCol = this.hasPgvector ? 'embedding vector' : 'vector TEXT';
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS repowiki_chunks (
        id         TEXT PRIMARY KEY,
        rel_path   TEXT,
        language   TEXT,
        start_line INTEGER,
        end_line   INTEGER,
        text       TEXT,
        ${embeddingCol}
      );
      CREATE INDEX IF NOT EXISTS idx_repowiki_chunks_path ON repowiki_chunks(rel_path);
    `);
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

  // --- chunks (with embeddings) ----------------------------------------------
  async insertChunks(records) {
    if (records.length === 0) return;

    if (this.hasPgvector) {
      // Fresh ingest (table was just reset): type the column to the active provider's dimension,
      // bulk-insert, then (re)build the HNSW cosine index — building after insert is faster.
      const dim = records[0].vector.length;
      await this.pool.query(`DROP INDEX IF EXISTS ${EMBEDDING_INDEX}`);
      await this.pool.query(
        `ALTER TABLE repowiki_chunks ALTER COLUMN embedding TYPE vector(${dim}) USING embedding::vector(${dim})`
      );
      await this.#batchInsert(
        'INSERT INTO repowiki_chunks (id, rel_path, language, start_line, end_line, text, embedding) VALUES %V ' +
          'ON CONFLICT (id) DO NOTHING',
        records.map((r) => [
          r.id,
          r.metadata.relPath,
          r.metadata.language,
          r.metadata.startLine,
          r.metadata.endLine,
          r.metadata.text,
          toVectorLiteral(r.vector),
        ])
      );
      await this.pool.query(
        `CREATE INDEX ${EMBEDDING_INDEX} ON repowiki_chunks USING hnsw (embedding vector_cosine_ops)`
      );
      logger.info(`pgvector: indexed ${records.length} embeddings (dim=${dim}, HNSW/cosine).`);
      return;
    }

    // No pgvector: JSON-text embeddings (searched in memory after reload).
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

  /**
   * In-database ANN search (pgvector mode only). `<=>` is cosine distance, so similarity is
   * 1 - distance — the same scale the in-memory dot-product search produces for unit vectors.
   */
  async searchChunks(queryVector, k) {
    const { rows } = await this.pool.query(
      `SELECT id, rel_path, language, start_line, end_line, text,
              1 - (embedding <=> $1::vector) AS score
       FROM repowiki_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [toVectorLiteral(queryVector), k]
    );
    return rows.map((row) => ({
      id: row.id,
      score: Number(row.score),
      metadata: {
        relPath: row.rel_path,
        language: row.language,
        startLine: row.start_line,
        endLine: row.end_line,
        text: row.text,
      },
    }));
  }

  async countChunks() {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS c FROM repowiki_chunks');
    return rows[0].c;
  }

  /** Per-file chunk stats for /api/files. */
  async fileStats() {
    const { rows } = await this.pool.query(
      `SELECT rel_path AS "relPath", MIN(language) AS language, COUNT(*)::int AS "chunkCount"
       FROM repowiki_chunks GROUP BY rel_path ORDER BY rel_path`
    );
    return rows;
  }

  /** Reconstructed per-file content for the diagram service. */
  async filesContent() {
    const { rows } = await this.pool.query(
      'SELECT rel_path, language, text FROM repowiki_chunks ORDER BY rel_path, start_line'
    );
    const out = new Map();
    for (const row of rows) {
      if (!out.has(row.rel_path)) out.set(row.rel_path, { language: row.language, parts: [] });
      out.get(row.rel_path).parts.push(row.text);
    }
    for (const [relPath, { language, parts }] of out) {
      out.set(relPath, { language, content: parts.join('\n') });
    }
    return out;
  }

  /**
   * All chunks as VectorStore records — used only in the no-pgvector fallback. Rows with a
   * missing/unparseable vector (older schema or partial ingest) are skipped rather than crashing
   * startup — the caller decides whether what's left is usable.
   */
  async allChunks() {
    const { rows } = await this.pool.query('SELECT * FROM repowiki_chunks');
    const records = [];
    let skipped = 0;
    for (const row of rows) {
      let vector;
      try {
        vector = JSON.parse(row.vector);
      } catch {
        skipped++;
        continue;
      }
      if (!Array.isArray(vector)) {
        skipped++;
        continue;
      }
      records.push({
        id: row.id,
        vector,
        metadata: {
          relPath: row.rel_path,
          language: row.language,
          startLine: row.start_line,
          endLine: row.end_line,
          text: row.text,
        },
      });
    }
    if (skipped > 0) {
      console.warn(`[pgRepoWikiStore] Skipped ${skipped} chunk row(s) with invalid vectors — re-ingest recommended.`);
    }
    return records;
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
