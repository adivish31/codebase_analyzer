# Codebase Knowledge AI

An AI tool that can **explain any concept in a codebase** and **generate diagrams** of how the
code flows. Point it at a repository; it ingests the code, indexes it for semantic search, and
answers natural-language questions ("How does authentication work?", "What calls `processPayment`?")
with grounded explanations and Mermaid diagrams.

> Status: scaffold + working pipeline with a **mock AI provider**. Swap in a real LLM/embeddings
> provider (OpenAI, Anthropic, local, …) by editing one file — see `docs/concepts/06-llm-provider-abstraction.md`.

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
cp .env.example .env
npm install
npm run dev        # starts the API on http://localhost:4000
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

- **Backend:** Node.js, Express
- **Persistence:** SQLite via Node's built-in `node:sqlite` (zero external deps) — RepoWiki DB + CodeGraph DB
- **Frontend:** Next.js (React)
- **AI:** provider-agnostic embeddings + LLM interfaces (mock, OpenAI, Anthropic)
- **Retrieval:** in-memory cosine vector search + hybrid keyword/symbol re-ranking
- **Diagrams:** Mermaid
