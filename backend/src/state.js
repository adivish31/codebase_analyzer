/**
 * Process-wide application state.
 *
 * Holds:
 *   - chunkIndex     : the retrieval index (in-memory brute force, or pgvector in-database ANN)
 *   - repoWiki       : RepoWiki DB  — chunks+embeddings, per-file wiki, codebase meta
 *   - codeGraph      : CodeGraph DB — files, symbols, import edges
 *   - codebase       : metadata about what's indexed (mirrors repoWiki meta), or null
 *
 * Drivers (see db/index.js):
 *   - DATABASE_URL + pgvector → chunks live ONLY in Postgres; search runs in-database (HNSW).
 *   - DATABASE_URL, no pgvector → Postgres rows reloaded into the in-memory index at startup.
 *   - otherwise SQLite (files or ':memory:'), reloaded into the in-memory index at startup.
 *
 * Everything that needs the current index imports from here — single source of truth.
 */
import { config } from './config.js';
import { logger } from './logger.js';
import { MemoryChunkIndex, PgChunkIndex } from './services/chunkIndex.js';
import { embeddingProvider } from './services/embeddings/index.js';
import { openStores } from './db/index.js';

export const appState = {
  codebase: null, // { source, fileCount, chunkCount, symbolCount, edgeCount, embedding, ingestedAt }
  chunkIndex: new MemoryChunkIndex(),
  repoWiki: null, // RepoWiki store (set by initState; sqlite or postgres)
  codeGraph: null, // CodeGraph store (set by initState; sqlite or postgres)
  driver: null, // 'postgres+pgvector' | 'postgres' | 'sqlite' | 'sqlite-memory'
  initialized: false,
};

/**
 * Open the persistence stores and prepare the retrieval index. With pgvector the index IS the
 * database (nothing to reload); otherwise persisted chunks are loaded back into memory.
 * Idempotent: safe to call multiple times (no-op after first success).
 */
export async function initState() {
  if (appState.initialized) return appState;

  const { repoWiki, codeGraph, driver } = await openStores(config);
  appState.repoWiki = repoWiki;
  appState.codeGraph = codeGraph;

  const usePgvector = driver === 'postgres' && repoWiki.hasPgvector;
  appState.driver = usePgvector ? 'postgres+pgvector' : driver;
  logger.info(`Persistence driver: ${appState.driver}`);

  if (config.persist) {
    const meta = await appState.repoWiki.getMeta();
    if (meta) {
      if (usePgvector) {
        appState.chunkIndex = new PgChunkIndex(repoWiki);
        logger.info(
          `Index ready in Postgres: ${await appState.chunkIndex.count()} chunks from ` +
            `${meta.fileCount} files (${meta.source}) — pgvector ANN search, nothing loaded into RAM.`
        );
      } else {
        const records = await appState.repoWiki.allChunks();
        appState.chunkIndex = new MemoryChunkIndex();
        await appState.chunkIndex.addAll(records);
        logger.info(
          `Reloaded persisted index: ${records.length} chunks from ${meta.fileCount} files (${meta.source}).`
        );
      }
      appState.codebase = meta;
      // Vectors from one embedding provider are meaningless to another's query embeddings.
      if (meta.embedding && meta.embedding.provider !== embeddingProvider.name) {
        logger.warn(
          `Index was embedded with "${meta.embedding.provider}" but the active provider is ` +
            `"${embeddingProvider.name}" — retrieval will be poor. Re-run /api/ingest.`
        );
      }
    } else {
      if (usePgvector) appState.chunkIndex = new PgChunkIndex(repoWiki);
      logger.info('Persistence on; no prior index found — waiting for /api/ingest.');
    }
  } else {
    logger.info('Persistence off (PERSIST=false) — nothing survives a restart.');
  }

  appState.initialized = true;
  return appState;
}

/** Reset everything (used when ingesting a new repo). */
export async function resetIndex() {
  appState.codebase = null;
  await appState.repoWiki?.reset();
  await appState.codeGraph?.reset();
  // pgvector index: the TRUNCATE above already emptied it. Memory index: start fresh.
  if (!(appState.chunkIndex instanceof PgChunkIndex)) {
    appState.chunkIndex = new MemoryChunkIndex();
  }
}

/** Close both stores (graceful shutdown). */
export async function closeState() {
  await appState.repoWiki?.close();
  await appState.codeGraph?.close();
  appState.initialized = false;
}

export default appState;
