# 06 — Production Hardening

This project is a clean scaffold. Here's the concrete roadmap from "runs on my laptop" to
"handles real traffic" — with the exact changes needed at each step.

---

## The 5 things to add first (in priority order)

### 1. Background job queue for ingestion

**Why now:** ingestion blocks an HTTP request for 10–120 seconds (cloning + embedding). A long
HTTP request is fragile (timeouts, client disconnects) and makes it impossible to show progress.

**What to use:** BullMQ (Redis-backed, Node.js-native) or AWS SQS.

**Changes:**
```javascript
// routes/ingest.js — instead of running the pipeline inline:
const job = await ingestQueue.add('ingest', { source });
res.json({ jobId: job.id, status: 'queued' });

// New: workers/ingestWorker.js
ingestQueue.process(async (job) => {
  const { source } = job.data;
  const { documents } = await ingestSource(source);
  // ... rest of pipeline ...
  await job.updateProgress(100);
});

// New: GET /api/ingest/status/:jobId
router.get('/ingest/status/:jobId', async (req, res) => {
  const job = await ingestQueue.getJob(req.params.jobId);
  res.json({ status: job.getState(), progress: job.progress });
});
```

### 2. Persistent vector store (pgvector)

**Why now:** restarting the server wipes all indexed data. Users lose their work.

**Changes to `state.js`:**
```javascript
// Before:
export const appState = { vectorStore: new VectorStore() };

// After:
import { VectorStoreDB } from './services/vectorStoreDB.js'; // wraps pgvector
export const appState = { vectorStore: new VectorStoreDB(pool) };
```

**pgvector schema:**
```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  rel_path TEXT,
  language TEXT,
  start_line INT,
  end_line INT,
  content TEXT,
  embedding vector(1536)
);
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
```

Everything else (ingest.js, rag.js) stays the same — they call `appState.vectorStore.add()` and
`.search()`, which the DB wrapper implements.

### 3. Auth middleware (JWT)

**Why now:** without auth, anyone who knows the server URL can ingest data and read answers.

**Changes:**
```javascript
// middleware/auth.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next(new ApiError(401, 'No token.'));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new ApiError(401, 'Invalid token.'));
  }
}

// app.js — add to protected routes
app.use('/api/ingest', requireAuth, ingestRoutes);
app.use('/api/ask', requireAuth, askRoutes);
```

Project ID from `req.user.projectId` is passed to the vector store for per-user filtering.

### 4. Answer caching (Redis)

**Why now:** the same question asked twice costs two LLM API calls. Caching reduces latency and cost.

**Cache key:** `SHA256(projectId + ":" + question.trim().toLowerCase())`

```javascript
// services/cache.js
import { createClient } from 'redis';
import { createHash } from 'node:crypto';

const client = createClient({ url: process.env.REDIS_URL });
const TTL = 3600; // 1 hour

export async function getCachedAnswer(projectId, question) {
  const key = createHash('sha256').update(`${projectId}:${question}`).digest('hex');
  const cached = await client.get(key);
  return cached ? JSON.parse(cached) : null;
}

export async function setCachedAnswer(projectId, question, answer) {
  const key = createHash('sha256').update(`${projectId}:${question}`).digest('hex');
  await client.setEx(key, TTL, JSON.stringify(answer));
}
```

**Add to `rag.js`:**
```javascript
const cached = await getCachedAnswer(projectId, question);
if (cached) return { ...cached, fromCache: true };
// ... proceed with retrieval ...
await setCachedAnswer(projectId, question, result);
```

### 5. Rate limiting

**Why now:** without it, a single user can exhaust your OpenAI quota in minutes.

```javascript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const askLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 20,               // 20 questions per minute per IP
  store: new RedisStore({ client: redisClient }),
  message: { error: 'Too many questions. Try again in a minute.' },
});
app.use('/api/ask', askLimiter);
```

---

## Observability

### Structured logging (already done — enhance it)

Current `logger.js` writes plain text. Upgrade to JSON for log aggregation:

```javascript
// logger.js enhancement
const log = (level, message, meta = {}) => {
  process.stdout.write(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }) + '\n');
};
```

Add `traceId` to every request using `AsyncLocalStorage`:
```javascript
import { AsyncLocalStorage } from 'node:async_hooks';
const storage = new AsyncLocalStorage();

app.use((req, res, next) => {
  const traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  storage.run({ traceId }, next);
});
// In logger: include storage.getStore()?.traceId
```

### Key metrics to track

| Metric | Why |
|--------|-----|
| `ingest.duration_ms` | Alert if ingestion takes > 5 min |
| `embedding.tokens_used` | Cost tracking |
| `retrieval.top_score` | Low top score = bad embedding / chunking |
| `llm.tokens_used` | Cost tracking per question |
| `llm.latency_ms` | User experience |
| `cache.hit_rate` | Cost savings; should be > 30% for repeated queries |

### Health checks

Extend `GET /api/health` to check dependencies:
```javascript
router.get('/health', async (req, res) => {
  const checks = {
    server: 'ok',
    vectorStore: appState.vectorStore.size > 0 ? 'indexed' : 'empty',
    redis: await redisClient.ping().then(() => 'ok').catch(() => 'down'),
    db: await pool.query('SELECT 1').then(() => 'ok').catch(() => 'down'),
  };
  const healthy = Object.values(checks).every((v) => v !== 'down');
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
});
```

---

## Incremental re-ingestion (on git push)

Full re-ingest on every push is expensive for large repos. Only re-index changed files.

**Webhook flow:**
1. GitHub sends `push` event to `POST /api/webhook/github`.
2. Extract changed file paths from `payload.commits[*].modified + added + removed`.
3. For removed files: `DELETE FROM chunks WHERE project_id=$1 AND rel_path=ANY($2)`.
4. For added/modified files: re-read → parse → chunk → embed → upsert.

```javascript
// Pseudo-code for incremental update
const { added, modified, removed } = extractChangedFiles(payload);
await vectorStore.deleteByPaths(projectId, [...removed, ...modified]);
const docs = await readFiles([...added, ...modified], repoRoot);
const chunks = chunkDocuments(parseDocuments(docs));
const vectors = await embedTexts(chunks.map(c => c.text));
chunks.forEach((c, i) => vectorStore.add({ ...c, vector: vectors[i], projectId }));
```

---

## Deployment architecture

### Single server (1–10 users)

```
Render / Railway / Fly.io
  └── Node.js process
        ├── Express API
        ├── In-process BullMQ worker (or external worker dyno)
        └── Redis (managed add-on)

Postgres + pgvector (managed: Supabase, Neon, Railway Postgres)
```

### Scaled (100–10k users)

```
Vercel (Next.js frontend)
  │
  ▼
AWS ALB / Cloudflare
  │
  ├── Express API pods (ECS / Kubernetes, 2–10 replicas)
  │     └── stateless; share Redis + DB
  │
  ├── Worker pods (BullMQ workers, 2–4 replicas)
  │
  ├── Redis (ElastiCache)
  │
  └── Postgres + pgvector (RDS, HNSW index)
```

### Serverless option

Replace Express with Vercel Functions or AWS Lambda. Trade-offs:
- Pro: zero server management, auto-scaling, pay-per-request
- Con: cold starts add latency; can't hold in-memory state (need DB from the start);
  ingestion is too long for serverless timeouts (use SQS + Lambda with 15-min timeout)

---

## Security checklist

- [ ] JWT auth on all mutating routes
- [ ] Rate limiting on `/api/ask` and `/api/ingest`
- [ ] Input validation: reject `source` URLs that aren't GitHub (or explicitly allow other hosts)
- [ ] Sanitise chunk text before injecting into prompts (prompt injection)
- [ ] Never log API keys (check `config.js` never logs `openaiApiKey`)
- [ ] CORS: lock to your frontend's domain in production (not `*`)
- [ ] TLS (HTTPS): terminate at load balancer; use Let's Encrypt
- [ ] Secrets: use environment variables or a secrets manager (AWS Secrets Manager, Doppler)
- [ ] File path validation: resolve `source` paths; reject anything outside allowed directories
- [ ] `git clone` timeout: already set (120s); also add disk-space check before cloning

---

## Interview Q&A

**Q: How would you make ingestion production-ready?**
Move it to a background job queue (BullMQ + Redis). Return a job ID immediately. Expose a
status endpoint. Add SSE for real-time progress. This handles large repos (> 30s), retries,
and prevents HTTP timeouts.

**Q: How do you keep the answer cache from serving stale data after a re-ingest?**
Namespace the cache key by `projectId + version` (or `ingestedAt` timestamp). On re-ingest,
increment the version → all old cache keys are effectively invalidated (and expire via TTL anyway).

**Q: How would you test the production system?**
- Unit: chunker, parser, vector store math (deterministic)
- Integration: `supertest` against real Express + a local fixture directory
- Load: k6 or Artillery — simulate 100 concurrent `/api/ask` requests, measure P95 latency
- Chaos: kill Redis mid-request; verify the system degrades gracefully and logs clearly
