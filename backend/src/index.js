/**
 * Entry point. Builds the app, starts the HTTP server, and shuts down gracefully on
 * SIGINT/SIGTERM (stop accepting connections, then close the persistence stores).
 */
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { closeState } from './state.js';

async function main() {
  const app = await createApp();
  const server = app.listen(config.port, () => {
    logger.info(`RepoLens backend listening on http://localhost:${config.port}`);
    logger.info(`AI provider: ${config.ai.provider}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully.`);
    server.close(async () => {
      try {
        await closeState();
      } catch (err) {
        logger.warn(`Error closing stores: ${err.message}`);
      }
      process.exit(0);
    });
    // Safety net: force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', err.stack || err.message);
  process.exit(1);
});
