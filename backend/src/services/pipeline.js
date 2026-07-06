/**
 * Ingest pipeline — the single implementation behind both ingest routes.
 *
 * POST /api/ingest        runs it silently and returns the final JSON.
 * POST /api/ingest/stream runs it with an onStage callback wired to SSE, so the client renders a
 *                         real progress bar (stage label + 0–100%) instead of a spinner.
 *
 * Stages (weights sum to 100 — embedding dominates because it's the slow part on real providers):
 *   cloning (0→15) → parsing (→20) → graphing (→30) → chunking (→35) → embedding (→85)
 *   → storing (→92) → wiki (→98) → done (100)
 */
import { logger } from '../logger.js';
import { appState, resetIndex } from '../state.js';
import { ingestSource } from './ingestion.js';
import { parseDocuments } from './parser.js';
import { chunkDocuments } from './chunker.js';
import { embedTexts, embeddingProvider } from './embeddings/index.js';
import { buildCodeGraph } from './codeGraph.js';
import { generateRepoWiki } from './repoWiki.js';

/**
 * Run the full indexing pipeline for `source`, replacing any previously-indexed codebase.
 * @param {string} source GitHub URL or local folder path
 * @param {(stage: string, percent: number, detail?: string) => void} [onStage]
 * @returns {Promise<object>} the persisted codebase metadata
 */
export async function runIngestPipeline(source, onStage = () => {}) {
  const startedAt = Date.now();

  onStage('cloning', 2, source);
  const { documents, meta } = await ingestSource(source);
  onStage('cloning', 15, `${meta.fileCount} files read`);

  const parsed = parseDocuments(documents);
  onStage('parsing', 20, `${parsed.length} files parsed`);

  await resetIndex();

  const { symbolCount, edgeCount } = await buildCodeGraph(parsed);
  onStage('graphing', 30, `${symbolCount} symbols · ${edgeCount} edges`);

  const chunks = chunkDocuments(parsed);
  onStage('chunking', 35, `${chunks.length} chunks`);

  // Embedding is the long stage — report per-batch progress across the 35→85 band.
  const vectors = await embedTexts(
    chunks.map((c) => c.text),
    (done, total) => onStage('embedding', 35 + Math.round((done / total) * 50), `${done}/${total} chunks`)
  );

  const records = chunks.map((chunk, i) => ({
    id: chunk.id,
    vector: vectors[i],
    metadata: {
      relPath: chunk.relPath,
      language: chunk.language,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      text: chunk.text,
    },
  }));
  // Persist chunks (with embeddings) to the RepoWiki DB and register them with the retrieval
  // index (no-op for pgvector — the DB rows ARE the index).
  await appState.repoWiki.insertChunks(records);
  await appState.chunkIndex.addAll(records);
  await appState.repoWiki.insertFiles(parsed);
  onStage('storing', 92, `${records.length} vectors persisted`);

  const wiki = await generateRepoWiki(parsed);
  onStage('wiki', 98, `${wiki.count} summaries`);

  appState.codebase = {
    ...meta,
    chunkCount: chunks.length,
    symbolCount,
    edgeCount,
    wikiCount: wiki.count,
    embedding: { provider: embeddingProvider.name, dim: embeddingProvider.dim },
    durationMs: Date.now() - startedAt,
  };
  await appState.repoWiki.saveMeta(appState.codebase);

  logger.info(
    `Indexed ${chunks.length} chunks, ${symbolCount} symbols, ${edgeCount} edges from ${meta.fileCount} files in ${appState.codebase.durationMs}ms.`
  );
  onStage('done', 100);

  return appState.codebase;
}

export default runIngestPipeline;
