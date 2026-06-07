# 05 — Express & REST API design

## What Express is

Express is a minimal Node.js web framework built around one idea: a request flows through a chain of
**middleware** functions, each with the signature `(req, res, next)`. Each can read/modify the
request, send a response, or call `next()` to pass control on.

## The middleware pipeline in this project

`app.js` wires it up in order:

```
CORS ─▶ express.json() ─▶ request logger ─▶ routes ─▶ notFound ─▶ errorHandler
```

- **CORS** — allows the frontend origin to call the API (browsers block cross-origin calls by
  default). Configured from `CORS_ORIGINS`.
- **`express.json()`** — parses a JSON request body into `req.body`.
- **Request logger** — custom middleware timing each request and logging method/path/status.
- **Routers** — `/api/health`, `/api/ingest`, `/api/ask` (and optionally `/api/diagram`).
- **`notFound`** — anything unmatched → 404 JSON.
- **`errorHandler`** — the 4-argument `(err, req, res, next)` form Express treats as the error sink.

**Order matters:** body parsing must precede routes that read `req.body`; error handlers must be
*last*.

## Error handling pattern

Two pieces make errors clean:

1. **`ApiError(status, message)`** — throw anywhere to set the HTTP status (`throw new ApiError(409,
   'No codebase indexed')`).
2. **`asyncHandler(fn)`** — wraps async handlers so a rejected promise is sent to `next(err)`.
   Without it, an async throw becomes an unhandled rejection and the request hangs.

The central `errorHandler` then formats every error into a consistent `{ error, details? }` shape
with the right status, logging 5xx as errors and 4xx as warnings.

## REST design choices

| Endpoint | Method | Why |
|----------|--------|-----|
| `/api/health` | GET | Liveness probe; safe, idempotent, no body. |
| `/api/status` | GET | Read current index state. |
| `/api/ingest` | POST | Creates/replaces a resource (the index); has a body; not idempotent-safe. |
| `/api/ask` | POST | Has a request body (the question); not cacheable as a GET. |
| `/api/diagram` | GET | Read-only derivation; parameters in the query string. |

Principles applied: **GET for reads, POST for actions with bodies**; **consistent JSON shapes**;
**meaningful status codes** (400 bad input, 409 wrong state, 422 unprocessable, 404 not found, 500
server error).

## The app factory pattern

`createApp()` builds and returns the app **without** calling `listen()`; `index.js` does the
listening. This separation makes the app importable in tests (you can fire requests at it without
binding a port) and keeps startup concerns isolated.

## Interview Q&A

**Q: What is middleware in Express?**
A function `(req, res, next)` in a chain; it can inspect/modify the request, end the response, or
call `next()` to continue. Cross-cutting concerns (auth, logging, parsing, errors) live here.

**Q: How does Express know a function is the error handler?**
It has four arguments `(err, req, res, next)`. It must be registered after all routes.

**Q: Why wrap async route handlers?**
So rejected promises are forwarded to the error middleware via `next(err)` instead of becoming
unhandled rejections that hang the request.

**Q: Why split `createApp()` from `listen()`?**
Testability and separation of concerns — you can import and test the app without opening a port.

**Q: Why is CORS needed?**
Browsers block cross-origin requests by default; the API must explicitly allow the frontend's origin.
