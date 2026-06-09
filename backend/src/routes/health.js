import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

/**
 * GET /api/health
 * Liveness/readiness probe. Returns the active AI provider so you can confirm whether you're on the
 * mock or a real provider without reading logs.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: config.env,
    aiProvider: config.ai.provider,
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});

export default router;
