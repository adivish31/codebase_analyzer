# 01 — System Design Walkthrough

How to answer "Design a system that lets users ask questions about a codebase" in an interview.
This is a 30–45 minute system design question. Follow this script, sketch as you talk.

---

## Step 1 — Clarify requirements (5 min)

Always clarify before drawing. Ask:

- **Scale:** how many repos? How many users? Daily queries?
  - "Let's say 1000 active users, repos up to 200k lines, 50k questions/day."
- **Freshness:** how quickly must code changes reflect in answers?
  - "Re-ingest on push (webhook), answer within 5 minutes of a commit."
- **Query types:** keyword lookup, conceptual ("how does auth work?"), or both?
  - "Natural language, so semantic search."
- **Real-time?** Streaming answers or batch?
  - "Real-time streaming preferred."
- **Auth?** Public or per-user private repos?
  - "Private repos, per-user isolation."

This scoping sets the constraints. For this project: small scale, single-user, local development — good for a demo, clear upgrade paths for production.

---

## Step 2 — High-level components (5 min)

Draw two flows: **Ingest** (write path) and **Query** (read path).

```
INGEST path
──────────────────────────────────────────────────────
Source (GitHub URL / local path)
  │
  ▼ Ingestion service
Clone repo / read local files → filter non-source files
  │
  ▼ Parser
Detect language, extract symbol names
  │
  ▼ Chunker
Sliding-window chunks with overlap (preserve line numbers)
  │
  ▼ Embedding service     ←── AI_PROVIDER env var selects
Batch texts → API → float vectors
  │
  ▼ Vector store
Upsert (id, vector, metadata: relPath, startLine, endLine, text)
  │
  ▼ Done  →  200 OK with stats

QUERY path
──────────────────────────────────────────────────────
question (string)
  │
  ▼ Embedding service (same provider)
embed_query(question) → query vector
  │
  ▼ Vector store
cosine_search(query_vector, top_K=5) → ranked chunks
  │
  ▼ RAG engine
build_prompt(system, context_blocks, question)
  │
  ▼ LLM provider     ←── AI_PROVIDER selects
complete(prompt) → answer text
  │
  ▼ 200 OK  →  { answer, sources: [{relPath, startLine, endLine, score}] }
```

---

## Step 3 — Deep-dive each component (15 min)

### Ingestion
- **GitHub clone:** `git clone --depth 1 <url> /tmp/cka-XXXX` — shallow clone, only latest tree.
- **File filter:** skip `node_modules`, `.git`, binaries, files > 200 KB, lock files.
- **Language detection:** extension → language name map (30+ extensions).
- **Tradeoff:** `execFile('git', ...)` vs GitHub API. Git is simpler and works for any host; API allows private repos with OAuth.

### Chunking
- **Why sliding window:** bounded size fits embedding token limits; overlap avoids split concepts.
- **Chunk size choice (1200 chars):** ~300 tokens — well within `text-embedding-3-small`'s 8191-token limit, and leaves room to send 5 chunks in the LLM prompt.
- **Better approach at scale:** tree-sitter AST chunking — split on function/class declarations for semantically coherent units.

### Embeddings
- **Mock provider:** hash tokenizer → L2-normalised 256-dim vector. Lexical overlap only.
- **OpenAI text-embedding-3-small:** semantic, 1536-dim. Batched (100/request).
- **Batching logic:** send chunks in groups of 100, await, concatenate results. Reduces API calls from N to N/100.

### Vector store
- **Dev:** in-memory array, brute-force cosine O(n·d). Zero infra.
- **Production:** pgvector (IVF/HNSW), Pinecone, Qdrant. Sub-linear search, persistence, multi-tenancy.
- **Metadata filtering:** "only search chunks from project X" — all vector DBs support this.

### RAG engine
- **Prompt structure:**
  ```
  [Context 1] path/to/file.js (lines 12-45, javascript)
  ```javascript
  <code chunk>
  ```

  [Context 2] ...

  ---
  Question: How does authentication work?
  ```
- **System prompt:** "Answer ONLY from the context. Cite files by path."
- **Why this structure:** clearly separates context from question; citing instruction reduces hallucination.

### LLM provider
- **Mock:** returns a deterministic structured summary for demos.
- **OpenAI (gpt-4o-mini):** cheap, fast, 128K context.
- **Anthropic (Claude Haiku):** 200K context, strong instruction-following.
- **Temperature 0.2:** factual, low randomness; not 0 to allow natural phrasing.

---

## Step 4 — Data model (5 min)

### Vector record (what we store)

```
{
  id:       "src/auth.js#0-42",    // unique chunk ID
  vector:   [0.012, -0.034, ...],  // 1536-dim float array
  metadata: {
    relPath:   "src/auth.js",
    language:  "javascript",
    startLine: 1,
    endLine:   45,
    text:      "import jwt from..."   // original text for prompt injection
  }
}
```

### Codebase metadata (what we track)

```
{
  source:     "https://github.com/...",
  fileCount:  42,
  chunkCount: 380,
  ingestedAt: "2026-06-28T10:00:00Z"
}
```

No relational schema needed in MVP. At scale, add a `projects` table and foreign-key metadata.

---

## Step 5 — Scaling to production (5 min)

Draw the scaled architecture when the interviewer pushes:

```
Client
  │
  ▼
CDN / Edge (Next.js on Vercel)
  │
  ▼
API Gateway / Load Balancer
  │
  ├──> Express API (Node.js, horizontal pods)
  │        │
  │        ├──> Job queue (BullMQ / SQS)  ──> Worker pods (ingestion)
  │        │
  │        ├──> Redis (answer cache, job status)
  │        │
  │        └──> Vector DB (Pinecone / Qdrant / pgvector)
  │
  └──> Auth service (JWT / OAuth)
```

**Key upgrade steps, in priority order:**
1. Move ingestion to background jobs (BullMQ) — it blocks HTTP right now.
2. Swap vector store for pgvector (persistent, already have Postgres).
3. Add Redis cache: `SHA256(question + projectId)` → cached answer (TTL = 1h).
4. Add auth middleware: JWT, project-scoped vector search.
5. Add webhook: GitHub push event → re-ingest changed files only (incremental).
6. Add streaming: SSE or WebSocket to stream LLM tokens to the client.
7. Observability: structured logs (already done), trace IDs, OpenTelemetry, latency histograms.

---

## Step 6 — Trade-offs to acknowledge

| Trade-off | Current choice | Production choice |
|-----------|---------------|-------------------|
| Persistence | In-memory (lost on restart) | pgvector / Pinecone |
| Ingestion | Synchronous HTTP request | Background job + progress polling |
| Auth | None | JWT + per-project namespacing |
| Chunking | Sliding-window | Syntax-aware (tree-sitter) |
| Embeddings | Mock (lexical) / OpenAI | OpenAI + optional local fallback |
| Multi-tenancy | Single codebase | Project-scoped vector namespaces |
| Caching | None | Redis for answers + embeddings |

---

## Common interviewer follow-ups and answers

**"What if the LLM gives a wrong answer?"**
That's a retrieval failure. First check: did the relevant chunks come back? (Log and inspect top-K.)
If not, improve chunking or switch to a better embedding model. If chunks are right but answer is
wrong, improve the prompt or use a more capable model.

**"How do you keep the index fresh?"**
Webhook on GitHub push → detect changed files → re-embed only the changed chunks → upsert to vector
DB (delete-by-file-path + re-insert). Full re-ingest as a fallback for major structural changes.

**"How do you handle private repos?"**
OAuth flow gets a user token → clone with that token. Vectors are stored with `project_id`; all
searches filter by it. Never mix vectors across users.

**"How would you add support for asking across multiple repos?"**
Store a `repo_id` in each vector's metadata. Let the user select repos to search; pass a metadata
filter `{ repo_id: { $in: [...] } }` to the vector store search.

**"What's the latency budget?"**
- Embed question: ~100ms (OpenAI)
- Vector search: <5ms (in-memory), <20ms (ANN)
- LLM completion: 500ms–2s (gpt-4o-mini, non-streaming)
- Total: ~700ms–2.5s. Streaming hides LLM latency well.
