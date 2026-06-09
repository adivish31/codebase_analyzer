import { logger } from '../logger.js';

/**
 * A small typed error you can throw anywhere to control the HTTP status returned to the client.
 *   throw new ApiError(404, 'No codebase ingested yet');
 */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** 404 handler — mounted after all routes. */
export function notFound(req, res) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}

/**
 * Central error-handling middleware. Express recognises it by its 4 arguments.
 * Keeps error formatting in one place so every endpoint returns a consistent shape.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, err.stack || err.message);
  } else {
    logger.warn(`${status} on ${req.method} ${req.originalUrl}: ${err.message}`);
  }
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(err.details ? { details: err.details } : {}),
  });
}

export default errorHandler;
