# 03 — Design decisions & trade-offs

A record of *why* the project is built the way it is — the questions a system-design interviewer
asks. Each decision lists the choice, the reason, and what you'd change at scale.

## 1. Monorepo with separate `backend/` and `frontend/`

**Choice:** one repo, two apps. **Why:** shared history, atomic cross-cutting changes, simple for a
two-person team. **At scale:** split into packages with a workspace tool (pnpm/turborepo) or
separate repos if deploy cadences diverge.

## 2. Express over a heavier framework (Nest, etc.)

**Choice:** plain Express. **Why:** minimal, transparent, easy to explain in an interview; the
concepts (middleware, routing, error handling) are visible rather than hidden behind decorators.
**At scale:** Nest/Fastify for structure, DI, and performance.

## 3. In-memory vector store

**Choice:** an array of vectors with brute-force cosine search. **Why:** zero infrastructure, runs
anywhere, and makes the math obvious. **Trade-offs:** not persistent (lost on restart), single
codebase at a time, O(n·d) per query, single process. **At scale:** a managed vector DB (pgvector,
Pinecone, Qdrant, Weaviate) or an ANN library (FAISS/HNSW) for sub-linear search and persistence.

## 4. AI behind a provider interface, with a mock default

**Choice:** `embeddings/index.js` and `providers/llm/index.js` expose `embedTexts()` / `complete()`
and pick an implementation from `AI_PROVIDER`. The default `mock` is deterministic and key-free.
**Why:** the app is runnable and demoable today; adding a real model is a one-file change; tests are
deterministic. This is dependency inversion — callers depend on the interface, not the vendor.
**At scale:** add real providers, retries/backoff, token budgeting, caching, and streaming.

## 5. Regex parsing instead of a real AST

**Choice:** detect language by extension and pull symbol names with regex. **Why:** dependency-free
and language-agnostic; good enough to enrich retrieval. **Trade-off:** misses nesting, scopes, and
edge cases. **At scale:** `tree-sitter` for real, multi-language ASTs → better chunk boundaries and
call graphs.

## 6. Line-aware sliding-window chunking with overlap

**Choice:** accumulate lines to ~`CHUNK_SIZE` chars, overlap consecutive chunks by `CHUNK_OVERLAP`.
**Why:** keeps chunks within model limits, preserves line numbers for citations, and overlap stops
concepts being split across a boundary. **At scale:** syntax-aware chunking (split on function/class
boundaries) for more coherent units.

## 7. Stateful index in one module (`state.js`)

**Choice:** a single shared `appState`. **Why:** one source of truth; routes stay stateless.
**Trade-off:** process-local, not concurrent-safe across instances. **At scale:** move state to a
datastore keyed by project/user; the module boundary makes this a localized change.

## 8. Optional mounting of the teammate's diagram route

**Choice:** `app.js` mounts `routes/diagram.js` only if the file exists. **Why:** lets the two
owners' code evolve independently — the backend runs standalone, and the diagram feature activates
when present. **Lesson:** designing for additive, low-coupling contributions in a team.

## Known limitations (be honest in interviews)

- No persistence, auth, rate-limiting, or multi-tenancy yet.
- Mock AI gives lexical, not deep-semantic, retrieval.
- One codebase indexed at a time.
- Regex parsing is approximate.

These are deliberate scope cuts for a scaffold, each with a clear upgrade path above.

## Interview Q&A

**Q: How would you make this production-ready?**
Persistent vector DB + DB-backed state, real embedding/LLM providers with caching and retries,
auth + rate-limiting, per-project isolation, background job for ingestion, observability (metrics,
tracing), and tests.

**Q: What did you optimize for in this version?**
Clarity and runnability with zero external dependencies, plus clean seams (provider interface,
service boundaries) so each piece can be upgraded independently.
