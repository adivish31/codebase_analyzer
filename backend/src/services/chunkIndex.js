/**
 * Chunk index abstraction — the one thing every retrieval consumer talks to.
 *
 * Two implementations behind the same async interface:
 *
 *   MemoryChunkIndex  chunks live in RAM (VectorStore, brute-force cosine). Used with the SQLite
 *                     drivers and with Postgres instances that lack the pgvector extension.
 *   PgChunkIndex      chunks live ONLY in Postgres; similarity search runs in-database via
 *                     pgvector (HNSW / cosine). Nothing is loaded into RAM at startup, so large
 *                     indexes don't inflate the Node heap and multiple instances share one index.
 *
 * Interface:
 *   count()                    → number of indexed chunks
 *   addAll(records)            → register freshly-ingested records (no-op for pg: rows are the index)
 *   search(queryVector, k)     → [{ id, score, metadata }] sorted by similarity
 *   fileStats()                → [{ relPath, language, chunkCount }] for /api/files
 *   filesContent()             → Map<relPath, { language, content }> for the diagram service
 */
import { VectorStore } from './vectorStore.js';

export class MemoryChunkIndex {
  constructor() {
    this.store = new VectorStore();
  }

  async count() {
    return this.store.size;
  }

  async addAll(records) {
    for (const rec of records) this.store.add(rec);
  }

  async search(queryVector, k) {
    return this.store.search(queryVector, k);
  }

  async fileStats() {
    const map = new Map();
    for (const rec of this.store.records) {
      const { relPath, language } = rec.metadata;
      if (!map.has(relPath)) map.set(relPath, { relPath, language, chunkCount: 0 });
      map.get(relPath).chunkCount += 1;
    }
    return [...map.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));
  }

  async filesContent() {
    const parts = new Map();
    for (const rec of this.store.records) {
      const { relPath, language, text } = rec.metadata;
      if (!parts.has(relPath)) parts.set(relPath, { language, texts: [] });
      parts.get(relPath).texts.push(text);
    }
    const out = new Map();
    for (const [relPath, { language, texts }] of parts) {
      out.set(relPath, { language, content: texts.join('\n') });
    }
    return out;
  }
}

export class PgChunkIndex {
  /** @param {import('../db/pgRepoWikiStore.js').PgRepoWikiStore} repoWikiStore */
  constructor(repoWikiStore) {
    this.store = repoWikiStore;
  }

  async count() {
    return this.store.countChunks();
  }

  // Rows written by insertChunks ARE the index — nothing extra to register.
  async addAll() {}

  async search(queryVector, k) {
    return this.store.searchChunks(queryVector, k);
  }

  async fileStats() {
    return this.store.fileStats();
  }

  async filesContent() {
    return this.store.filesContent();
  }
}

export default MemoryChunkIndex;
