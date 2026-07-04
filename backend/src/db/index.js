/**
 * Store factory — picks the persistence driver from config.
 *
 *   DATABASE_URL set + PERSIST=true → Postgres  (managed DB; survives restarts AND redeploys)
 *   PERSIST=true                    → SQLite files under DATA_DIR (survives restarts)
 *   PERSIST=false                   → SQLite ':memory:' (nothing survives; fastest for dev/tests)
 *
 * Both drivers implement the same async interface, so nothing above this layer knows which one
 * is active. The health route reports the chosen driver.
 */
import path from 'node:path';

import { RepoWikiStore } from './repoWikiStore.js';
import { CodeGraphStore } from './codeGraphStore.js';
import { PgRepoWikiStore } from './pgRepoWikiStore.js';
import { PgCodeGraphStore } from './pgCodeGraphStore.js';

/**
 * Open both stores for the given config.
 * @param {{ persist: boolean, dataDir: string, databaseUrl: string }} cfg
 * @returns {Promise<{ repoWiki, codeGraph, driver: string }>}
 */
export async function openStores(cfg) {
  if (cfg.persist && cfg.databaseUrl) {
    return {
      repoWiki: await PgRepoWikiStore.open(cfg.databaseUrl),
      codeGraph: await PgCodeGraphStore.open(cfg.databaseUrl),
      driver: 'postgres',
    };
  }

  const repoWikiPath = cfg.persist ? path.join(cfg.dataDir, 'repowiki.db') : ':memory:';
  const codeGraphPath = cfg.persist ? path.join(cfg.dataDir, 'codegraph.db') : ':memory:';
  return {
    repoWiki: await RepoWikiStore.open(repoWikiPath),
    codeGraph: await CodeGraphStore.open(codeGraphPath),
    driver: cfg.persist ? 'sqlite' : 'sqlite-memory',
  };
}

export default openStores;
