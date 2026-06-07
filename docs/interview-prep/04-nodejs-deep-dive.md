# 04 — Node.js Deep Dive

Everything you need to discuss Node.js internals, async patterns, and the choices made in this
project during a technical interview.

---

## The event loop — how Node.js works

Node.js is **single-threaded** on V8 JavaScript. I/O operations are handed to the OS via **libuv**.
The event loop processes callbacks from completed I/O, timers, and async operations.

### Event loop phases (in order)

```
   ┌──────────────────────────┐
   │  timers                  │  ← setTimeout / setInterval callbacks
   │  pending callbacks       │  ← I/O errors from previous iteration
   │  idle, prepare           │  ← internal use
   │  poll                    │  ← wait for I/O; execute I/O callbacks
   │  check                   │  ← setImmediate callbacks
   │  close callbacks         │  ← socket.on('close'), etc.
   └──────────────────────────┘
```

### Microtasks (run between every phase)

After each phase (and between tasks), Node drains the **microtask queue**:
1. `process.nextTick()` callbacks (higher priority)
2. Resolved `Promise` callbacks

```javascript
setImmediate(() => console.log('check phase'));  // printed 3rd
Promise.resolve().then(() => console.log('microtask'));  // printed 2nd
process.nextTick(() => console.log('nextTick'));  // printed 1st
console.log('sync');  // printed 0th
// Output: sync → nextTick → microtask → check phase
```

### Why this matters for the project

`fs.readFileSync` in `walk()` blocks the event loop during ingestion. That's intentional — 
ingestion is a dedicated operation, but it means no other requests can be handled while it runs.
At scale, move ingestion to a Worker Thread or child process.

---

## async/await under the hood

`async/await` is syntactic sugar over Promises. The compiled form:

```javascript
// What you write:
async function fetchChunks() {
  const data = await embedTexts(chunks);
  return process(data);
}

// What the runtime does (roughly):
function fetchChunks() {
  return embedTexts(chunks).then((data) => process(data));
}
```

`await` does NOT block the thread. It:
1. Registers a `.then()` callback on the Promise.
2. Returns control to the event loop (other callbacks can run).
3. Resumes the function when the Promise settles.

### The asyncHandler pattern (in this project)

```javascript
// middleware/asyncHandler.js
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

**Why needed:** Express 4 doesn't catch rejected async route handlers. If an async function throws,
the rejection is unhandled and the request hangs. The wrapper passes errors to `next(err)`, which
flows to `errorHandler`.

Express 5 (alpha) removes this need by natively handling async.

---

## ESM vs CommonJS — the choice in this project

This project uses ESM (`"type": "module"` in `package.json`).

| Feature | ESM | CommonJS |
|---------|-----|---------|
| Syntax | `import`/`export` | `require()`/`module.exports` |
| Loading | Static, synchronous parse; async execute | Dynamic, synchronous |
| Tree-shaking | Yes (bundlers can eliminate dead exports) | No |
| Top-level `await` | Yes | No |
| `__dirname` | No (use `import.meta.url`) | Yes |
| Browser compatible | Yes | No |

**`__dirname` workaround in this project:**
```javascript
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Dynamic import** (used in `app.js` for the optional diagram route):
```javascript
// ESM: dynamic import is async, returns a promise
const { default: diagramRoutes } = await import('./routes/diagram.js');
```

---

## fs module — what we use and why

### `fs.readdirSync` vs `fs.readdir`

Both list directory contents. Sync blocks the thread; async doesn't.

In `ingestion.js → walk()`, we use sync because:
- `walk()` is already inside a request handler that users understand will take time.
- The recursive directory traversal is highly sequential — async recursion is complex code for a minor benefit.
- At scale, replace with `fs.promises.readdir` in a proper async queue (p-limit).

### `fs.readFileSync` for file contents

Same reasoning. For a demo project, sync reads during ingestion are acceptable.

**Production alternative:**
```javascript
import { readFile } from 'node:fs/promises';
// Concurrent reads with a limit to avoid opening too many file descriptors:
import pLimit from 'p-limit';
const limit = pLimit(20);
const contents = await Promise.all(paths.map((p) => limit(() => readFile(p, 'utf8'))));
```

### `fs.mkdtempSync` for clone directory

```javascript
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cka-'));
// Creates e.g. /tmp/cka-a1B2c3
```

`mkdtempSync` creates a unique temporary directory — avoids naming collisions when multiple
ingestion requests run concurrently.

---

## Child processes — `execFile` for git clone

```javascript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

await execFileAsync('git', ['clone', '--depth', '1', url, dir], { timeout: 120000 });
```

### `execFile` vs `exec` vs `spawn`

| Method | Shell | Buffer output | Streaming | Injection risk |
|--------|-------|---------------|-----------|----------------|
| `exec` | Yes | Yes (256KB) | No | Yes (shell injection) |
| `execFile` | No | Yes (256KB) | No | No (args array) |
| `spawn` | No | No (stream) | Yes | No |

**`execFile` is the right choice here:**
- No shell interpolation → no injection risk (the URL is user-provided)
- Output (error messages) fits in the buffer
- `promisify` gives us async/await

**`spawn` is better when:**
- Output is large (streaming webpack build, etc.)
- You want real-time output events

---

## Express patterns used in this project

### Router factory vs `app` directly

```javascript
// routes/health.js
import { Router } from 'express';
const router = Router();
router.get('/health', handler);
export default router;

// app.js
app.use('/api', healthRoutes);
```

**Why:** each route file is self-contained. The prefix (`/api`) is applied once in `app.js`.
If you rename the prefix later, you change one line.

### Middleware order matters

```javascript
app.use(cors(...));           // 1. CORS headers added first
app.use(express.json(...));   // 2. Parse JSON body
app.use(requestLogger);       // 3. Log after body is parsed
app.use('/api', routes);      // 4. Routes
app.use(notFound);            // 5. 404 for unmatched routes
app.use(errorHandler);        // 6. Error handler MUST be last
```

### Error handler signature

Express identifies an error handler by its arity (4 arguments):
```javascript
// errorHandler.js
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
}
```

### The `ApiError` pattern

```javascript
// Throw from anywhere in a route:
throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');

// errorHandler picks it up:
if (err instanceof ApiError) res.status(err.status).json({ error: err.message });
```

Keeps error responses consistent without each route building its own response shape.

---

## Module system — how `state.js` works as a singleton

```javascript
// state.js
import { VectorStore } from './services/vectorStore.js';
export const appState = {
  codebase: null,
  vectorStore: new VectorStore(),
};
```

ES modules are **cached after first import** — the module is evaluated once, and subsequent
imports return the same object. This makes `appState` a true singleton: any route that imports
it sees the same instance.

This is the Node.js module cache acting as dependency injection. Caveat: if you run multiple
processes (cluster, multiple containers), each has its own cache — state is not shared. That's
the scale-up trigger to move to a database.

---

## Common Node.js interview questions

**Q: What is the difference between `process.nextTick` and `setImmediate`?**
`process.nextTick` runs before the next event loop phase (even before I/O callbacks).
`setImmediate` runs in the check phase, after I/O. Both defer synchronous work, but `nextTick`
is higher priority. Recursive `nextTick` can starve I/O.

**Q: How would you handle CPU-intensive work in Node.js?**
Options: Worker Threads (shared memory via `SharedArrayBuffer`), child processes (separate V8
instances), C++ addons (native performance). For embedding computation, offloading to a Python
service or calling an external API is also common.

**Q: What is a stream in Node.js and how would you use one here?**
Streams process data in chunks without buffering the whole thing in memory. For LLM responses,
you'd use `fetch` with a readable stream, pipe tokens to the client via SSE (`res.write()`), and
end with `res.end()`. Useful for large repo file traversal too.

**Q: Why does this project use `"type": "module"` instead of `.mjs` extensions?**
Setting `"type": "module"` in `package.json` makes all `.js` files in the package treated as ESM.
Using `.mjs` requires renaming every file. `"type": "module"` is the cleaner approach for a
pure-ESM project.

**Q: How would you add rate limiting to the Express API?**
Use `express-rate-limit` middleware:
```javascript
import rateLimit from 'express-rate-limit';
app.use('/api/ask', rateLimit({ windowMs: 60000, max: 20 }));
```
For distributed systems (multiple Express instances), back with a Redis store (`rate-limit-redis`).
