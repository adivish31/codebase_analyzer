/**
 * GET /api/files
 *
 * Returns a deduplicated list of every source file currently in the retrieval index,
 * with language and the number of chunks indexed from it. Useful for the frontend
 * to display a file tree or let the user request a per-file module diagram.
 */
import { Router } from 'express';
import { appState } from '../state.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

router.get(
  '/files',
  asyncHandler(async (req, res) => {
    if (!appState.codebase) {
      throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');
    }

    // Aggregated per-file stats come straight from the index (memory or Postgres).
    const files = await appState.chunkIndex.fileStats();

    res.json({
      fileCount: files.length,
      totalChunks: await appState.chunkIndex.count(),
      files,
    });
  })
);

export default router;
