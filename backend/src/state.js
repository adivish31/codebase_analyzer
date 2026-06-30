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
import path from 'node:path';

import { config } from './config.js';
import { logger } from './logger.js';
import { VectorStore } from './services/vectorStore.js';
import { RepoWikiStore } from './db/repoWikiStore.js';
import { CodeGraphStore } from './db/codeGraphStore.js';

export const appState = {
  codebase: null, // { source, fileCount, chunkCount, symbolCount, edgeCount, ingestedAt }
  vectorStore: new VectorStore(),
  repoWiki: null, // RepoWikiStore (set by initState)
  codeGraph: null, // CodeGraphStore (set by initState)
  initialized: false,
};

/**
 * Open the SQLite stores and, if persistence is on and data exists, reload the in-memory index.
 * Idempotent: safe to call multiple times (no-op after first success).
 */
export async function initState() {
  if (appState.initialized) return appState;

  const repoWikiPath = config.persist ? path.join(config.dataDir, 'repowiki.db') : ':memory:';
  const codeGraphPath = config.persist ? path.join(config.dataDir, 'codegraph.db') : ':memory:';

  appState.repoWiki = await RepoWikiStore.open(repoWikiPath);
  appState.codeGraph = await CodeGraphStore.open(codeGraphPath);

  if (config.persist) {
    const meta = appState.repoWiki.getMeta();
    if (meta) {
      const records = appState.repoWiki.allChunks();
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
    logger.info('Persistence off (PERSIST=false) — using in-memory SQLite.');
  }

  appState.initialized = true;
  return appState;
}

/** Reset everything (used when ingesting a new repo). */
export function resetIndex() {
  appState.codebase = null;
  appState.vectorStore = new VectorStore();
  appState.repoWiki?.reset();
  appState.codeGraph?.reset();
}

export default appState;
