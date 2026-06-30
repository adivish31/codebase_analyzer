/**
 * RepoWiki routes — the browsable, curated knowledge base.
 *
 *   GET /api/wiki              → all per-file summary cards
 *   GET /api/wiki/file?relPath → one file's summary card
 */
import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { appState } from '../state.js';
import { getWiki, listWiki } from '../services/repoWiki.js';

const router = Router();

function ensureIndexed() {
  if (!appState.codebase) {
    throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');
  }
}

router.get(
  '/wiki',
  asyncHandler(async (req, res) => {
    ensureIndexed();
    const files = listWiki();
    res.json({ count: files.length, files });
  })
);

router.get(
  '/wiki/file',
  asyncHandler(async (req, res) => {
    ensureIndexed();
    const relPath = (req.query.relPath || '').trim();
    if (!relPath) throw new ApiError(400, 'Provide `relPath` query param.');
    const entry = getWiki(relPath);
    if (!entry) throw new ApiError(404, `No wiki entry for ${relPath}.`);
    res.json(entry);
  })
);

export default router;
