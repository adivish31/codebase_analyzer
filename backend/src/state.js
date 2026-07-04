/**
 * Process-wide application state.
 *
 * Holds:
 *   - vectorStore    : in-memory brute-force semantic index (the fast search path)
 *   - repoWiki       : RepoWiki DB  (SQLite) — chunks+vectors, per-file wiki, codebase meta
 *   - codeGraph      : CodeGraph DB (SQLite) — files, symbols, import edges
 *   - codebase       : metadata about what's indexed (mirrors repoWiki meta), or null
 *
 * Persistence is configurable (config.persist):
 *   - PERSIST=true  → DBs are files under config.dataDir; the index reloads on startup.
 *   - PERSIST=false → DBs use SQLite ':memory:' (same code path, nothing survives restart).
 *
 * Everything that needs the current index imports from here — single source of truth.
 */
import { config } from './config.js';
import { logger } from './logger.js';
import { VectorStore } from './services/vectorStore.js';
import { openStores } from './db/index.js';

export const appState = {
  codebase: null, // { source, fileCount, chunkCount, symbolCount, edgeCount, ingestedAt }
  vectorStore: new VectorStore(),
  repoWiki: null, // RepoWiki store (set by initState; sqlite or postgres)
  codeGraph: null, // CodeGraph store (set by initState; sqlite or postgres)
  driver: null, // 'postgres' | 'sqlite' | 'sqlite-memory'
  initialized: false,
};

/**
 * Open the persistence stores and, if persistence is on and data exists, reload the in-memory
 * index. Idempotent: safe to call multiple times (no-op after first success).
 */
export async function initState() {
  if (appState.initialized) return appState;

  const { repoWiki, codeGraph, driver } = await openStores(config);
  appState.repoWiki = repoWiki;
  appState.codeGraph = codeGraph;
  appState.driver = driver;
  logger.info(`Persistence driver: ${driver}`);

  if (config.persist) {
    const meta = await appState.repoWiki.getMeta();
    if (meta) {
      const records = await appState.repoWiki.allChunks();
      appState.vectorStore = new VectorStore();
      for (const rec of records) appState.vectorStore.add(rec);
      appState.codebase = meta;
      logger.info(
        `Reloaded persisted index: ${records.length} chunks from ${meta.fileCount} files (${meta.source}).`
      );
    } else {
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
  appState.vectorStore = new VectorStore();
  await appState.repoWiki?.reset();
  await appState.codeGraph?.reset();
}

/** Close both stores (graceful shutdown). */
export async function closeState() {
  await appState.repoWiki?.close();
  await appState.codeGraph?.close();
  appState.initialized = false;
}

export default appState;
