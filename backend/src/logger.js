/**
 * Tiny structured logger. No dependency — keeps the project light and the concept transparent.
 * In production you'd swap this for pino/winston; the interface (info/warn/error/debug) is the same.
 */
function ts() {
  return new Date().toISOString();
}

function log(level, msg, meta) {
  const base = `${ts()} [${level.toUpperCase()}] ${msg}`;
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console.log(base, typeof meta === 'string' ? meta : JSON.stringify(meta));
  } else {
    // eslint-disable-next-line no-console
    console.log(base);
  }
}

export const logger = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') log('debug', msg, meta);
  },
};

export default logger;
