import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { appState } from '../state.js';
import { generateDiagram } from '../services/diagram.js';

// [TEAMMATE-OWNED route — generated for hand-off, edit freely.]
const router = Router();

/**
 * GET /api/diagram?type=architecture|dependency|module&relPath=...
 * Returns Mermaid diagram source for the frontend to render.
 */
router.get(
  '/diagram',
  asyncHandler(async (req, res) => {
    if (!appState.codebase) {
      throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');
    }
    const { type, relPath } = req.query;
    const result = await generateDiagram(type || 'architecture', { relPath });
    res.json(result);
  })
);

export default router;
