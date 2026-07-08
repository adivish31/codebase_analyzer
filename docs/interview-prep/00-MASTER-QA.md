# Master Interview Q&A — RepoLens

A single-file reference for 60+ questions organised by topic. For deep explanations, follow
the links to the topic-specific files. Use this as a self-quiz the night before an interview.

---

## RAG & AI pipeline

**Q1. What is RAG in one sentence?**
Retrieve the most relevant pieces of an external knowledge base, then have an LLM generate an
answer grounded *only* in those pieces — preventing hallucination and enabling citations.

**Q2. Why not just fine-tune the model on the codebase?**
Fine-tuning is slow, expensive, and doesn't cite sources. RAG updates instantly on re-ingest,
is cheaper per query, and can point to the exact file/line that informed the answer.

**Q3. What are the two phases of RAG?**
*Indexing* (offline): ingest → chunk → embed → store.
*Querying* (per request): embed question → retrieve top-K → build prompt → generate.

**Q4. What is TOP_K and why does it matter?**
The number of chunks fed to the LLM. Too low = missing context; too high = noise, cost, and
potentially hitting the context-window limit. A common starting point is 3–10; tune with recall@K.

**Q5. How would you evaluate this RAG system?**
Three layers: *retrieval* (recall@K: did the right chunks come back?), *faithfulness* (did the
LLM stick to the retrieved context?), *correctness* (is the final answer right?). Tools: RAGAS,
TruLens, or a simple LLM-as-judge eval loop.

**Q6. What can go wrong in a RAG pipeline?**
- Bad chunking → the relevant snippet is split across chunk boundaries.
- Weak embeddings → wrong chunks retrieved (lexical vs. semantic gap).
- Prompt not constraining → LLM ignores context and hallucinates.
- Context too large → model loses focus on the middle (lost-in-the-middle effect).
- Stale index → code changed, but index not re-ingested.

**Q7. What is the difference between lexical and semantic search?**
Lexical (BM25, TF-IDF): matches exact words. Fast, good for keyword queries, fails on synonyms.
Semantic (embedding cosine): matches meaning, handles synonyms but can miss rare identifiers.
Hybrid (both) is often best for code, because code uses both natural language and identifiers.

**Q8. How does the mock embeddings provider work?**
Tokenises text (splitting camelCase and snake_case), hashes each token into a bucket in a
256-dim vector (term-frequency style), then L2-normalises. Captures lexical overlap but not
semantic meaning; good enough for keyword-style queries.

---

## Embeddings

**Q9. What is a vector embedding?**
A dense numerical array where the distance/dot-product between two vectors represents semantic
similarity. "Similar text → similar vectors" is learned by training on massive corpora.

**Q10. Why L2-normalise embeddings?**
When vectors are unit-length, cosine similarity equals the dot product — O(n) instead of computing
norms separately. It also removes magnitude effects (long chunks would otherwise dominate).

**Q11. What is the dimension of OpenAI's text-embedding-3-small?**
1536. You can truncate to lower dimensions (256, 512) trading some quality for speed/storage.
Our mock provider uses 256 for speed; real providers expose this via the `dimensions` parameter.

**Q12. What are some embedding model choices and trade-offs?**
- `text-embedding-3-small` (OpenAI): fast, cheap, 1536-dim. Good default.
- `text-embedding-3-large` (OpenAI): better quality, 3072-dim, 5× more expensive.
- `voyage-code-3` (Voyage AI): code-specific, often beats OpenAI on code retrieval tasks.
- `nomic-embed-text` (local, Ollama): free, 768-dim, good for air-gapped environments.

---

## Vector search

**Q13. What is cosine similarity and how is it calculated?**
cos(θ) = (A·B) / (|A| × |B|). For L2-normalised vectors this reduces to the dot product.
Result in [−1, 1]; higher = more similar.

**Q14. What is the time complexity of brute-force vector search?**
O(n × d) per query — n = number of vectors, d = dimension. Fine for thousands; unacceptable at
millions.

**Q15. What are ANN (Approximate Nearest Neighbour) algorithms?**
Algorithms that find *approximate* (not exact) nearest neighbours in sub-linear time.
- **HNSW** (Hierarchical Navigable Small Worlds): graph-based, O(log n), high recall, widely used.
- **IVF** (Inverted File): partitions space into Voronoi cells, probes a subset. Flat for exact, PQ for compressed.
- **LSH** (Locality Sensitive Hashing): hash-based, fast but lower recall.
Most managed vector DBs (Pinecone, Qdrant, Weaviate) use HNSW under the hood.

**Q16. When would you move from brute-force to an ANN index?**
When query latency becomes unacceptable — typically above ~50k–100k vectors for real-time use cases.

**Q17. What are the vector DB options for production?**
See `docs/interview-prep/03-vector-db-comparison.md` for full table. Quick take:
- **pgvector**: great if already on Postgres; HNSW and IVF indexes.
- **Pinecone**: fully managed, easy to start, proprietary.
- **Qdrant**: open-source, fast, Rust-based, great metadata filtering.
- **Weaviate**: open-source, strong hybrid search (BM25 + vector).
- **FAISS**: library (not a DB), use if embedding/searching locally.

---

## Chunking

**Q18. Why do we chunk at all?**
Embedding models and LLMs have fixed token limits (~8K for embeddings, 4K–128K for LLMs).
A 10 000-line file can't fit; chunking breaks it into indexable, retrievable pieces.

**Q19. What is chunking overlap and why does it help?**
The last N characters of chunk i are repeated at the start of chunk i+1. This ensures a concept
that straddles a boundary still appears whole in at least one chunk, improving recall.

**Q20. What are better chunking strategies than sliding-window?**
- **Syntax-aware** (tree-sitter): split on function/class boundaries — each chunk is a coherent unit.
- **Semantic** (embed then cluster): split where embedding similarity drops — keeps related lines together.
- **Sentence-window**: index individual sentences but retrieve surrounding sentences.
- **Parent-document retrieval**: index small chunks, retrieve the larger parent document when matched.

**Q21. What chunk size did you use and why?**
~1200 characters with 200-character overlap. Large enough for meaningful context, small enough
to fit inside any embedding model's token limit and avoid padding-out the LLM prompt.

---

## Express / REST API

**Q22. How does Express middleware work?**
A middleware function receives `(req, res, next)`. If it calls `next()`, the request passes to
the next middleware/route; if it calls `res.send()`, the chain ends. Order of `app.use()` calls
determines the chain order.

**Q23. What is the purpose of separating `createApp()` from `index.js`?**
The factory pattern: `app.js` builds the app, `index.js` calls `listen()`. This makes the app
importable in tests without opening a real port.

**Q24. Why use `asyncHandler` wrapper?**
Express 4 doesn't catch rejected promises from async route handlers — they hang. `asyncHandler`
wraps them in a try/catch and calls `next(err)`, which flows to the central error handler.

**Q25. What HTTP status codes are used and why?**
- `200 OK`: successful request
- `400 Bad Request`: missing or invalid input (e.g. no `source` in body)
- `409 Conflict`: precondition not met (codebase not indexed yet)
- `422 Unprocessable Entity`: input valid but resulted in empty output (no source files found)
- `500 Internal Server Error`: unexpected server-side failure

**Q26. How is CORS configured and why does it matter?**
`cors({ origin: config.corsOrigins })` allows the frontend's origin to call the API. Browsers
enforce Same-Origin Policy by default; CORS headers opt-in to cross-origin requests.

---

## Node.js

**Q27. What is the Node.js event loop?**
Node runs JavaScript single-threaded on V8. I/O operations (fs, network) are delegated to the OS
(libuv). When they complete, callbacks/microtasks are queued. The event loop phases: timers →
pending callbacks → idle/prepare → poll → check (setImmediate) → close callbacks.

**Q28. How does `async/await` interact with the event loop?**
`await` suspends the current async function (releasing the thread) and resumes it when the
awaited promise settles. This lets other callbacks run while waiting for I/O — no blocking.

**Q29. Why can Node.js be slow for CPU-intensive tasks?**
The event loop is single-threaded. A long synchronous computation (e.g. large embedding
calculation) blocks all other requests. Solutions: Worker Threads, child processes, or offload to
a native addon.

**Q30. What is `fs.readFileSync` vs `fs.readFile` and when to use each?**
Sync blocks the event loop — only safe at startup (e.g. reading config). Async `readFile` returns
a promise/callback and doesn't block. In the ingestion service we use sync reads inside a
`walk()` loop — acceptable because ingestion is a one-time, dedicated operation called from a
route handler (it blocks that one request but not others for long because files are local).

---

## LLM fundamentals

**Q31. What is a token?**
The atomic unit of text an LLM processes. Roughly 3/4 of a word in English; ~1 token per code
identifier. Pricing, context limits, and latency all scale with token count.

**Q32. What is a context window?**
The maximum number of tokens an LLM can hold in one call (system + user messages + completion).
GPT-4o: 128K. Claude Haiku: 200K. Larger windows let you send more retrieved chunks — but cost
and latency increase with usage.

**Q33. What is temperature and when would you set it to 0?**
Temperature controls randomness: 0 = deterministic (greedy decoding), 1 = creative. For RAG Q&A
over code, you want factual and consistent answers → temperature 0 or 0.1.

**Q34. What is a system prompt?**
An instruction given to the LLM that sets its persona and constraints — e.g., "You are a senior
engineer. Answer using ONLY the provided context. Cite files by path." System prompts are
processed once at the start of a conversation.

**Q35. What is the "lost in the middle" problem?**
LLMs pay less attention to content in the middle of a long context window than at the beginning
or end. Mitigation: put the most important chunks first or last, or use re-ranking to surface
the top chunk.

**Q36. What is hallucination and how does RAG reduce it?**
Hallucination = the model generating confident but incorrect information from its training memory.
RAG reduces it by constraining the answer to the retrieved context and instructing the model
explicitly: "Answer ONLY from the provided context."

---

## System design

**Q37. Walk me through the architecture of this system.**
(Whiteboard answer — see `docs/interview-prep/01-system-design-walkthrough.md` for the full script.)

**Q38. How would you scale this to handle 1000 concurrent users?**
- Stateless backend: run multiple instances behind a load balancer
- Shared persistent vector DB (pgvector / Pinecone) instead of in-memory
- Background job queue (BullMQ / SQS) for ingestion (it's slow)
- Redis cache for popular question→answer pairs
- Horizontal scaling with Kubernetes; auto-scale on CPU/queue depth

**Q39. How would you handle multi-tenancy (each user's private codebase)?**
Namespace vectors by project/user ID in the vector DB. Add auth middleware (JWT). Each `/ask`
call passes the user's project ID to filter the search to their vectors only.

**Q40. How would you add streaming responses?**
Replace `complete()` with a streaming call, use Express's chunked transfer encoding (`res.write()`),
and consume a `ReadableStream` on the frontend with `fetch` + `getReader()`.

**Q41. How would you make ingestion more robust?**
Move it to a background job queue (BullMQ, SQS). Return a job ID immediately; the client polls
`/api/status/:jobId`. Add retries, dead-letter queue for failed jobs, and a progress event stream
(SSE) for real-time updates.

**Q42. Where are the bottlenecks?**
1. **Ingestion:** cloning large repos + embedding thousands of chunks (I/O + API calls).
2. **Ask:** embedding the question + LLM completion time (API latency).
3. **Vector search:** O(n·d) at scale. Fix with ANN index.

---

## Code quality & patterns

**Q43. What design pattern is the provider abstraction?**
Dependency Inversion + Strategy Pattern. High-level modules (`rag.js`) depend on the abstraction
(`embeddings/index.js`), not the concrete vendor. Swapping providers = changing one env var.

**Q44. What is the single responsibility principle and where do you see it here?**
Each service does exactly one thing: ingestion reads files, parser enriches metadata, chunker
splits, embeddings vectorise, vector store indexes, RAG orchestrates. This makes each piece
independently testable and replaceable.

**Q45. Why is `state.js` a single module rather than passing state through constructors?**
For simplicity in a single-process, single-codebase app — one source of truth. The module
boundary makes it easy to swap for a real datastore later (localized change in `state.js`).

**Q46. How would you add tests to this codebase?**
Start with unit tests (Node's built-in `node --test`): test `chunker.js` with known inputs,
`parser.js` with sample code, `vectorStore.js` for search correctness. Integration tests: spin
up the Express app with `supertest`, POST to `/api/ingest` a local fixture folder, then POST
to `/api/ask` and assert the answer contains a source from that folder.

---

## Behavioural / project-story

**Q47. Tell me about a challenging technical decision in this project.**
See `docs/interview-prep/07-behavioral-project-story.md` — the provider abstraction decision,
mock-first approach, and optional diagram route coupling.

**Q48. How did you split work with your teammate?**
Clear interface boundaries: the backend exposes `/api/diagram`, the frontend/diagram-service
owner builds to that contract. Optional mounting (`app.js` checks if the file exists) means
our code runs standalone — no blocking dependency.

**Q49. What would you do differently?**
1. Start with a real embedding provider sooner (mock gaps become obvious quickly in demos).
2. Add a background job for ingestion from the start — blocking HTTP requests for large repos is wrong.
3. Write integration tests before the code was "done" — catching wiring bugs earlier.

**Q50. What is the most important thing you learned building this?**
The RAG retrieval quality ceiling is set by chunking + embeddings, not the LLM. A smarter prompt
doesn't fix bad retrieval; you have to go up the pipeline.

---

## Quick-fire concepts

| Concept | One-line answer |
|---------|----------------|
| ESM vs CJS | ESM: `import/export`, static analysis, tree-shaking. CJS: `require()`, dynamic. This project uses ESM (`"type":"module"`). |
| `dotenv` | Loads `.env` into `process.env` at startup; centralised in `config.js`. |
| CORS | Browser security policy; the server opts in to cross-origin requests via headers. |
| Vector dimension | The length of the embedding array; higher = more expressive, more memory. |
| Cosine vs Euclidean | Cosine ignores magnitude (good for text). Euclidean includes it (better for some image/audio tasks). |
| pgvector | PostgreSQL extension adding a `vector` column type and HNSW/IVF indexes. |
| `git clone --depth 1` | Shallow clone — only the latest commit, not history. Faster for ingestion. |
| BM25 | Probabilistic ranking function (term frequency × inverse document frequency). Backbone of Elasticsearch / Lucene. |
| Re-ranking | A second-pass model (cross-encoder) that scores (query, chunk) pairs together for higher accuracy than bi-encoder retrieval. |
| Token budget | The planned allocation of tokens across system prompt, retrieved context, and completion to stay within the model's context window. |
