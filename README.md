# Codebase Knowledge AI

An AI tool that can **explain any concept in a codebase** and **generate diagrams** of how the
code flows. Point it at a repository; it ingests the code, indexes it for semantic search, and
answers natural-language questions ("How does authentication work?", "What calls `processPayment`?")
with grounded explanations and Mermaid diagrams.

> Status: **working end-to-end with real AI** (Google Gemini by default when a key is set) and
> production persistence (managed Postgres via `DATABASE_URL`, or local SQLite). A mock provider
> still lets everything run with zero API keys — see `docs/concepts/06-llm-provider-abstraction.md`.

## What it does

1. **Ingest** a GitHub repo (public or private) or local folder → reads source files.
2. **Parse + chunk** each file into retrievable pieces; extract structured symbols (functions,
   classes, methods) with line numbers.
3. **Build relationships** → a **CodeGraph DB** (SQLite) of files, symbols, and import edges.
4. **Embed + curate** → chunks go into a vector index + **RepoWiki DB** (SQLite) with per-file
   summary cards. Both databases persist, so the index survives restarts.
5. **Ask** a question → **hybrid retrieval** (semantic vectors + keyword/symbol/path matching) →
   an LLM explains the answer, grounded in real code, citing files and the symbols involved.
6. **Find** structurally → "Where is `processPayment` defined?", "What imports this file?"
7. **Diagram** the flow → Mermaid architecture / dependency diagrams + a JSON code graph.

## Architecture (high level)

```
Next.js frontend ──HTTP──> Express backend
(chat · diagrams ·                 │
 code map · wiki)                  ▼
                       Ingestion → Parser (symbols) ──┬─────────────► CodeGraph DB (SQLite)
                                                       │               files · symbols · edges
                                                       ▼
                                     Chunker → Embeddings → Vector Store (in-memory)
                                                       │                     │
                                                       ▼                     │
                                               RepoWiki DB (SQLite) ◄────────┘
                                               chunks+vectors · wiki · meta
                                                       │
                          Question ─► Hybrid RAG (vectors + symbols) ─► LLM provider
                                                       │
                                                       ▼
                                  Answer + sources + symbol hints + diagrams
```

Full detail: [`docs/architecture/01-system-overview.md`](docs/architecture/01-system-overview.md)
and [`docs/architecture/04-codegraph-and-persistence.md`](docs/architecture/04-codegraph-and-persistence.md).

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness + provider/persistence/index status |
| `GET` | `/api/status` | Whether a codebase is indexed |
| `POST` | `/api/ingest` | Index a repo: `{ "source": "<url>" }` or `{ "path": "<folder>" }` |
| `POST` | `/api/ask` | Hybrid-RAG answer: `{ "question": "..." }` → answer + sources + symbols |
| `GET` | `/api/files` | Indexed files with chunk counts |
| `GET` | `/api/symbols?name=X` | Where a symbol is defined |
| `GET` | `/api/graph` | File dependency graph (nodes + edges) |
| `GET` | `/api/file?relPath=Y` | One file's symbols, dependencies, dependents, wiki |
| `GET` | `/api/wiki` | All per-file summary cards |
| `GET` | `/api/diagram?type=...` | Mermaid architecture/dependency diagram |

Environment variables: [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

## Repository layout

```
backend/      Express API + the AI pipeline (ingestion, chunking, embeddings, vector store, RAG)
frontend/     Next.js app (repo input, chat UI, diagram viewer)   [teammate-owned]
docs/         Interview-ready concept deep-dives + architecture/design docs
COMMITS.md    Exact git commands to commit each part to GitHub
SHARE_WITH_TEAMMATE.md   What to hand to the teammate and how
```

## Ownership

This is a two-person project. See `SHARE_WITH_TEAMMATE.md` for the full split.

- **Aditya (committed):** scaffold, docs, Express core, ingestion, parsing/chunking, embeddings +
  vector store, RAG engine.
- **Teammate (shared as code to edit & commit herself):** diagram-generation service, Next.js frontend.

## Quick start (backend)

```bash
cd backend
cp .env.example .env       # runs with mock AI by default; add GEMINI_API_KEY + AI_PROVIDER=gemini for real AI
npm install
npm run dev        # starts the API on http://localhost:4000
npm test           # 31 unit + API integration tests (node --test, no extra deps)
```

Then try the pipeline with the mock provider:

```bash
# 1. Ingest this repo itself
curl -X POST http://localhost:4000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"path": "../"}'

# 2. Ask a question
curl -X POST http://localhost:4000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How does the chunker work?"}'
```

## Tech stack

- **Backend:** Node.js, Express (helmet, per-IP rate limiting, graceful shutdown)
- **Persistence (swappable driver):** managed **Postgres** when `DATABASE_URL` is set (Supabase/Neon/RDS — survives redeploys), otherwise SQLite via Node's built-in `node:sqlite` — RepoWiki DB + CodeGraph DB either way
- **Frontend:** Next.js (React)
- **AI:** provider-agnostic embeddings + LLM interfaces — **Gemini** (`gemini-2.5-flash` + `gemini-embedding-001`, with 429 retry/backoff), OpenAI, Anthropic, or mock (zero keys)
- **Retrieval:** in-memory cosine vector search + hybrid keyword/symbol re-ranking
- **Diagrams:** Mermaid
- **Tests:** `node --test` — unit + API integration (31 tests)

## Production notes

- Set `NODE_ENV=production`: local-path ingestion is disabled (git URLs only) and rate limits apply
  per client IP (`ASK_RATE_LIMIT`, `INGEST_RATE_LIMIT`; set `TRUST_PROXY=true` behind a proxy).
- Point `DATABASE_URL` at a managed Postgres to keep the index across restarts **and** redeploys;
  `GET /api/health` reports the active persistence driver.
- Full variable reference: [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).
