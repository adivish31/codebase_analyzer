/**
 * GET /api/files
 *
 * Returns a deduplicated list of every source file currently in the vector index,
 * with language and the number of chunks indexed from it. Useful for the frontend
 * to display a file tree or let the user request a per-file module diagram.
 */
import { Router } from 'express';
import { appState } from '../state.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

router.get('/files', (req, res) => {
  if (!appState.codebase || appState.vectorStore.size === 0) {
    throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');
  }

  // Aggregate per-file stats from vector store metadata (no disk re-reads needed)
  const fileMap = new Map(); // relPath -> { relPath, language, chunkCount }
  for (const rec of appState.vectorStore.records) {
    const { relPath, language } = rec.metadata;
    if (!fileMap.has(relPath)) {
      fileMap.set(relPath, { relPath, language, chunkCount: 0 });
    }
    fileMap.get(relPath).chunkCount += 1;
  }

  const files = [...fileMap.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));

  res.json({
    fileCount: files.length,
    totalChunks: appState.vectorStore.size,
    files,
  });
});

export default router;
