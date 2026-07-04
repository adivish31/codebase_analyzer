import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { appState, resetIndex } from '../state.js';

import { ingestSource } from '../services/ingestion.js';
import { parseDocuments } from '../services/parser.js';
import { chunkDocuments } from '../services/chunker.js';
import { embedTexts } from '../services/embeddings/index.js';
import { buildCodeGraph } from '../services/codeGraph.js';
import { generateRepoWiki } from '../services/repoWiki.js';

const router = Router();

/**
 * POST /api/ingest
 * Body: { "source": "<github url>" }  OR  { "path": "<local folder>" }
 *
 * Full indexing pipeline:
 *   ingest -> parse -> [reset] -> build code graph -> chunk -> embed -> store (memory + RepoWiki DB)
 *   -> generate repo wiki -> persist meta.
 * Replaces any previously-ingested codebase.
 */
router.post(
  '/ingest',
  asyncHandler(async (req, res) => {
    const source = req.body.source || req.body.path;
    if (!source) {
      throw new ApiError(400, 'Provide `source` (GitHub URL) or `path` (local folder).');
    }

    const startedAt = Date.now();

    // 1. Ingest raw files
    const { documents, meta } = await ingestSource(source);

    // 2. Parse (language detection + structured symbols)
    const parsed = parseDocuments(documents);

    // 3. Fresh index (clears in-memory store + both persistence DBs)
    await resetIndex();

    // 4. Build the code graph (files, symbols, import edges) -> CodeGraph DB
    const { symbolCount, edgeCount } = await buildCodeGraph(parsed);

    // 5. Chunk into retrievable pieces
    const chunks = chunkDocuments(parsed);

    // 6. Embed every chunk
    const vectors = await embedTexts(chunks.map((c) => c.text));

    // 7. Store chunks in the in-memory index AND persist them (with vectors) to RepoWiki DB
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
    for (const rec of records) appState.vectorStore.add(rec);
    await appState.repoWiki.insertChunks(records);
    await appState.repoWiki.insertFiles(parsed);

    // 8. Curate per-file wiki summaries -> RepoWiki DB
    const wiki = await generateRepoWiki(parsed);

    // 9. Persist codebase metadata
    appState.codebase = {
      ...meta,
      chunkCount: chunks.length,
      symbolCount,
      edgeCount,
      wikiCount: wiki.count,
      durationMs: Date.now() - startedAt,
    };
    await appState.repoWiki.saveMeta(appState.codebase);

    logger.info(
      `Indexed ${chunks.length} chunks, ${symbolCount} symbols, ${edgeCount} edges from ${meta.fileCount} files in ${appState.codebase.durationMs}ms.`
    );

    res.json({
      message: 'Codebase ingested and indexed.',
      codebase: appState.codebase,
    });
  })
);

export default router;
