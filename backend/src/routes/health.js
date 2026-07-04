import { Router } from 'express';
import { config } from '../config.js';
import { appState } from '../state.js';

const router = Router();

/**
 * GET /api/health
 * Liveness/readiness probe. Returns the active AI provider, persistence mode, and whether a
 * codebase is currently indexed — so you can confirm state without reading logs.
 */
router.get('/health', async (req, res) => {
  res.json({
    status: 'ok',
    env: config.env,
    aiProvider: config.ai.provider,
    persist: config.persist,
    persistenceDriver: appState.driver,
    indexed: Boolean(appState.codebase),
    chunks: await appState.chunkIndex.count(),
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});

export default router;
