/**
 * Express application factory.
 *
 * Builds and returns the configured Express app WITHOUT starting the HTTP server. Separating "build
 * the app" from "listen on a port" (see index.js) makes the app importable in tests and keeps
 * startup logic clean.
 */
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { logger } from './logger.js';
import { initState } from './state.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import healthRoutes from './routes/health.js';
import ingestRoutes from './routes/ingest.js';
import askRoutes from './routes/ask.js';
import filesRoutes from './routes/files.js';
import graphRoutes from './routes/graph.js';
import wikiRoutes from './routes/wiki.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createApp() {
  // Open the SQLite stores (and reload any persisted index) before serving requests.
  await initState();

  const app = express();

  // --- Core middleware ---
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '5mb' })); // parse JSON bodies (repo paths, questions)

  // Simple request logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  // --- Routes ---
  app.use('/api', healthRoutes);
  app.use('/api', ingestRoutes);
  app.use('/api', askRoutes);
  app.use('/api', filesRoutes);
  app.use('/api', graphRoutes);
  app.use('/api', wikiRoutes);

  // Diagram route is the teammate's part — mount it ONLY if the file exists, so this backend
  // runs standalone and her route auto-activates once added. (See SHARE_WITH_TEAMMATE.md)
  const diagramPath = path.join(__dirname, 'routes', 'diagram.js');
  if (fs.existsSync(diagramPath)) {
    try {
      const { default: diagramRoutes } = await import('./routes/diagram.js');
      app.use('/api', diagramRoutes);
      logger.info('Mounted optional diagram route.');
    } catch (err) {
      logger.warn(`Found diagram route but failed to mount it: ${err.message}`);
    }
  } else {
    logger.info('Diagram route not present yet (teammate part) — skipping.');
  }

  // --- Error handling (must be last) ---
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
