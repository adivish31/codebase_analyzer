import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { appState } from '../state.js';
import { answerQuestion } from '../services/rag.js';

const router = Router();

/**
 * GET /api/status
 * Reports whether a codebase is indexed (handy for the frontend to gate the chat UI).
 */
router.get('/status', (req, res) => {
  res.json({
    indexed: Boolean(appState.codebase),
    codebase: appState.codebase,
  });
});

/**
 * POST /api/ask
 * Body: { "question": "How does X work?", "topK"?: number }
 * Returns a grounded answer + the source chunks it used.
 */
router.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const { question, topK } = req.body || {};
    if (!question) throw new ApiError(400, '`question` is required.');

    const result = await answerQuestion(question, { topK });
    res.json(result);
  })
);

export default router;
