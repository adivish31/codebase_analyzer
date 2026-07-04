/**
 * CodeGraph DB  (SQLite-backed persistence)  — the "Building Relationships → CodeGraph DB" box.
 *
 * Stores the structural graph of the codebase:
 *   - files   : every indexed file (graph nodes)
 *   - symbols : declared functions / classes / methods (with kind + line) for "where is X defined?"
 *   - edges   : file -> file import relationships for "what depends on / imports Y?"
 *
 * Queried directly (not via embeddings) to answer structural questions precisely.
 *
 * NOTE: every method is async even though node:sqlite is synchronous — the Postgres store
 * (db/pgCodeGraphStore.js) implements the exact same interface, so callers never know which
 * driver is behind it.
 */
import { openDatabase } from './sqlite.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  rel_path TEXT PRIMARY KEY,
  language TEXT
);
CREATE TABLE IF NOT EXISTS symbols (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT,
  kind     TEXT,
  rel_path TEXT,
  line     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(rel_path);
CREATE TABLE IF NOT EXISTS edges (
  from_path TEXT,
  to_path   TEXT,
  kind      TEXT
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_path);
CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_path);
`;

export class CodeGraphStore {
  constructor(db) {
    this.db = db;
  }

  static async open(filePath) {
    const db = await openDatabase(filePath);
    db.exec(SCHEMA);
    return new CodeGraphStore(db);
  }

  async reset() {
    this.db.exec('DELETE FROM files; DELETE FROM symbols; DELETE FROM edges;');
  }

  /** Close the underlying connection (graceful shutdown). */
  async close() {
    this.db.close();
  }

  // --- writes (bulk, transactional) ----------------------------------------
  async insertFiles(files) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO files (rel_path, language) VALUES (?, ?)');
    this.#tx(() => {
      for (const f of files) stmt.run(f.relPath, f.language);
    });
  }

  async insertSymbols(symbols) {
    const stmt = this.db.prepare(
      'INSERT INTO symbols (name, kind, rel_path, line) VALUES (?, ?, ?, ?)'
    );
    this.#tx(() => {
      for (const s of symbols) stmt.run(s.name, s.kind, s.relPath, s.line);
    });
  }

  async insertEdges(edges) {
    const stmt = this.db.prepare('INSERT INTO edges (from_path, to_path, kind) VALUES (?, ?, ?)');
    this.#tx(() => {
      for (const e of edges) stmt.run(e.from, e.to, e.kind || 'import');
    });
  }

  // --- queries --------------------------------------------------------------

  /** Find where a symbol is defined (case-insensitive, partial match supported). */
  async findSymbol(name, { exact = false, limit = 25 } = {}) {
    if (exact) {
      return this.db
        .prepare('SELECT name, kind, rel_path AS relPath, line FROM symbols WHERE name = ? LIMIT ?')
        .all(name, limit);
    }
    return this.db
      .prepare(
        `SELECT name, kind, rel_path AS relPath, line FROM symbols
         WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT ?`
      )
      .all(`%${name}%`, limit);
  }

  /** Files that import `relPath` (i.e. who depends on it). */
  async dependentsOf(relPath) {
    return this.db
      .prepare('SELECT DISTINCT from_path AS relPath FROM edges WHERE to_path = ? ORDER BY from_path')
      .all(relPath)
      .map((r) => r.relPath);
  }

  /** Files that `relPath` imports (its dependencies). */
  async dependenciesOf(relPath) {
    return this.db
      .prepare('SELECT DISTINCT to_path AS relPath FROM edges WHERE from_path = ? ORDER BY to_path')
      .all(relPath)
      .map((r) => r.relPath);
  }

  /** Whole graph for visualization (capped). */
  async getGraph(limit = 300) {
    const nodes = this.db.prepare('SELECT rel_path AS relPath, language FROM files LIMIT ?').all(limit);
    const nodeSet = new Set(nodes.map((n) => n.relPath));
    const edges = this.db
      .prepare('SELECT from_path AS "from", to_path AS "to", kind FROM edges')
      .all()
      .filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to));
    return { nodes, edges };
  }

  /** Symbols declared in one file. */
  async symbolsIn(relPath) {
    return this.db
      .prepare('SELECT name, kind, line FROM symbols WHERE rel_path = ? ORDER BY line')
      .all(relPath);
  }

  async counts() {
    const n = (sql) => this.db.prepare(sql).get().c;
    return {
      files: n('SELECT COUNT(*) AS c FROM files'),
      symbols: n('SELECT COUNT(*) AS c FROM symbols'),
      edges: n('SELECT COUNT(*) AS c FROM edges'),
    };
  }

  // --- helpers --------------------------------------------------------------
  #tx(fn) {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

export default CodeGraphStore;
