/**
 * Wraps an async route handler so any thrown error / rejected promise is forwarded to Express's
 * error-handling middleware via `next(err)`. Without this, an async throw would become an
 * unhandled rejection and the request would hang.
 *
 * Usage: router.post('/x', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
