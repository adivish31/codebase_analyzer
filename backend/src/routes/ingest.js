import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { runIngestPipeline } from '../services/pipeline.js';

const router = Router();

function requireSource(req) {
  const source = req.body.source || req.body.path;
  if (!source) {
    throw new ApiError(400, 'Provide `source` (GitHub URL) or `path` (local folder).');
  }
  return source;
}

/**
 * POST /api/ingest
 * Body: { "source": "<github url>" }  OR  { "path": "<local folder>" }
 * Runs the full pipeline and answers once with the final stats. (Kept request/response for
 * curl-ability and the integration tests; the UI uses /ingest/stream below.)
 */
router.post(
  '/ingest',
  asyncHandler(async (req, res) => {
    const source = requireSource(req);
    const codebase = await runIngestPipeline(source);
    res.json({ message: 'Codebase ingested and indexed.', codebase });
  })
);

/**
 * POST /api/ingest/stream
 * Same body, but responds as Server-Sent Events with live pipeline progress:
 *   event: stage   data: {"stage":"embedding","percent":62,"detail":"64/126 chunks"}
 *   event: done    data: {"codebase":{...}}
 *   event: error   data: {"error":"..."}
 */
router.post('/ingest/stream', async (req, res) => {
  let source;
  try {
    source = requireSource(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const codebase = await runIngestPipeline(source, (stage, percent, detail) => {
      send('stage', { stage, percent, detail });
    });
    send('done', { codebase });
  } catch (err) {
    logger.error(`Streamed ingest failed: ${err.message}`);
    send('error', { error: err.message });
  } finally {
    res.end();
  }
});

export default router;
