import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { appState, resetIndex } from '../state.js';

import { ingestSource } from '../services/ingestion.js';
import { parseDocuments } from '../services/parser.js';
import { chunkDocuments } from '../services/chunker.js';
import { embedTexts } from '../services/embeddings/index.js';

const router = Router();

/**
 * POST /api/ingest
 * Body: { "source": "<github url>" }  OR  { "path": "<local folder>" }
 *
 * Runs the full indexing pipeline: ingest -> parse -> chunk -> embed -> store.
 * Replaces any previously-ingested codebase.
 */
router.post(
  '/ingest',
  asyncHandler(async (req, res) => {
    const source = req.body.source || req.body.path;
    if (!source) {
      throw new ApiError(400, 'Provide `source` (GitHub URL) or `path` (local folder).');
    }

    // 1. Ingest raw files
    const { documents, meta } = await ingestSource(source);

    // 2. Parse (language detection + light structure)
    const parsed = parseDocuments(documents);

    // 3. Chunk into retrievable pieces
    const chunks = chunkDocuments(parsed);

    // 4. Embed every chunk's text into a vector
    const vectors = await embedTexts(chunks.map((c) => c.text));

    // 5. Store in a fresh vector index
    resetIndex();
    chunks.forEach((chunk, i) => {
      appState.vectorStore.add({
        id: chunk.id,
        vector: vectors[i],
        metadata: {
          relPath: chunk.relPath,
          language: chunk.language,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          text: chunk.text,
        },
      });
    });

    appState.codebase = {
      ...meta,
      chunkCount: chunks.length,
    };

    logger.info(`Indexed ${chunks.length} chunks from ${meta.fileCount} files.`);

    res.json({
      message: 'Codebase ingested and indexed.',
      codebase: appState.codebase,
    });
  })
);

export default router;
