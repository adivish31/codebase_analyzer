/**
 * Entry point. Builds the app and starts the HTTP server.
 */
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

async function main() {
  const app = await createApp();
  app.listen(config.port, () => {
    logger.info(`Codebase Knowledge AI backend listening on http://localhost:${config.port}`);
    logger.info(`AI provider: ${config.ai.provider}`);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', err.stack || err.message);
  process.exit(1);
});
