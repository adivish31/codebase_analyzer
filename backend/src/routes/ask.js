import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { appState } from '../state.js';
import { answerQuestion, answerQuestionStream } from '../services/rag.js';
import { logger } from '../logger.js';

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

/**
 * POST /api/ask/stream
 * Same body as /ask, but answers as Server-Sent Events:
 *   event: sources  data: { sources: [...], symbols: [...] }   (before the first token)
 *   event: token    data: { delta: "..." }                      (repeated)
 *   event: done     data: { answer, model, sources, symbols, cached? }
 *   event: error    data: { error }
 */
router.post('/ask/stream', async (req, res) => {
  const { question, topK } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const result = await answerQuestionStream(
      question,
      { topK },
      {
        onSources: (payload) => send('sources', payload),
        onToken: (delta) => send('token', { delta }),
      }
    );
    send('done', result);
  } catch (err) {
    logger.error(`Streamed ask failed: ${err.message}`);
    send('error', { error: err.message });
  } finally {
    res.end();
  }
});

export default router;
