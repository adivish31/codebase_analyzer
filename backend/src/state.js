/**
 * Process-wide application state (in-memory).
 *
 * For this scaffold we keep the ingested codebase + its vector index in memory so the project runs
 * with zero external services. In production you'd replace this with a database / persistent vector
 * store (see docs/architecture/03-design-decisions.md). Everything that needs the current index
 * imports from here, so there is a single source of truth.
 */
import { VectorStore } from './services/vectorStore.js';

export const appState = {
  /** Metadata about the currently-ingested codebase, or null if none yet. */
  codebase: null, // { source, fileCount, chunkCount, ingestedAt }
  /** The vector index of code chunks. */
  vectorStore: new VectorStore(),
};

/** Reset everything (used when ingesting a new repo). */
export function resetIndex() {
  appState.codebase = null;
  appState.vectorStore = new VectorStore();
}

export default appState;
