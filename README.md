# Cairn

**Ask your codebase a question. Get the exact lines back.**

Cairn indexes any GitHub repo or local folder into a searchable vector index plus a code graph of
every symbol and import — then answers questions in plain language, streamed token-by-token, with
`file:line` citations that deep-link to GitHub at the indexed commit, and Mermaid diagrams it
draws itself.

> A cairn is a stack of stones that marks the trail through unfamiliar terrain.

## Measured, not promised

<!-- EVAL:START -->
_Last run 2026-07-07 · LLM: `groq` · 18 golden questions (`npm run eval`)_

| Metric | Score |
|--------|-------|
| Retrieval hit-rate@5 | **83%** |
| Citation accuracy | **94%** |
| Keyword coverage | **100%** |
| Mermaid-valid rate | **100%** |
| Latency p50 / p95 | **8300ms / 13271ms** |
<!-- EVAL:END -->

The eval harness (`evals/golden.json` + `backend/scripts/eval.js`) boots the real app, ingests the
backend's own source, and runs 18 golden questions through the real `/api/ask` pipeline. No mocks,
no cherry-picking — re-run it yourself.

Two honest caveats: latency includes Groq **free-tier** rate-limit backoff (a paid tier answers in
1–2s), and the run above used mock (lexical) embeddings — the remaining retrieval misses are
semantic gaps that a `GEMINI_API_KEY` closes.

## What it does

1. **Ingest** — shallow-clones a repo (public, or private with `GITHUB_TOKEN`), filters source
   files, records the commit SHA for citation deep-links. Live staged progress over SSE.
2. **Parse + chunk** — extracts symbols (name/kind/line) and splits files into line-aware
   overlapping chunks.
3. **Graph** — resolves import edges between files into a **CodeGraph DB**; chunks + vectors and
   per-file wiki summaries persist in a **RepoWiki DB** (SQLite by default, Postgres via
   `DATABASE_URL`). The index survives restarts.
4. **Ask** — hybrid retrieval (cosine similarity re-ranked by path/symbol matches) feeds a
   streaming LLM constrained to cite its sources or say the context is insufficient. Answers
   stream over SSE with citations arriving before the first token; repeats hit an LRU cache.
5. **Explore** — symbol lookup ("where is `processPayment` defined?"), file dependency queries,
   a browsable repo wiki, and Mermaid architecture/dependency diagrams.

## Quick start

```bash
# API (port 4000) — runs fully with zero keys (mock AI provider)
cd backend
npm install
npm run dev

# Web (port 3000) — landing page at /, workspace at /workspace
cd frontend
npm install
npm run dev
```

For real answers, set two env vars in `backend/.env`:

```bash
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...        # free tier: console.groq.com
# optional, for real semantic embeddings instead of lexical:
GEMINI_API_KEY=...          # free tier: aistudio.google.com
```

Every variable is documented in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/ingest` | Index a repo (blocking JSON) |
| `POST` | `/api/ingest/stream` | Same, with SSE stage progress (0–100%) |
| `POST` | `/api/ask` | Grounded answer + sources + symbol hints |
| `POST` | `/api/ask/stream` | SSE: `sources` → `token`× n → `done` |
| `GET` | `/api/symbols?name=X` | Where a symbol is defined |
| `GET` | `/api/graph` | File dependency graph (nodes + edges) |
| `GET` | `/api/file?relPath=Y` | One file: symbols, dependencies, dependents, wiki |
| `GET` | `/api/wiki` | Per-file summary cards |
| `GET` | `/api/diagram?type=architecture\|dependency\|module` | Mermaid source |
| `GET` | `/api/files` · `/api/status` · `/api/health` | Index contents / status / liveness |

## Architecture

```
Next.js 16 frontend ──HTTP/SSE──▶ Express API
(landing · workspace)                  │
                        Ingestion ─▶ Parser ─▶ CodeGraph DB   (files · symbols · import edges)
                             │            │
                             ▼            ▼
                        Chunker ─▶ Embeddings ─▶ Vector index (in-memory, rehydrated at boot)
                                        │
                                        ▼
                                  RepoWiki DB   (chunks+vectors · wiki · meta)
                                        │
        question ─▶ hybrid retrieval (cosine + symbol/path re-rank) ─▶ LLM (streamed) ─▶
                    answer + file:line citations + symbol hints
```

Deep-dives: [system overview](docs/architecture/01-system-overview.md) ·
[request lifecycle](docs/architecture/02-request-lifecycle.md) ·
[design decisions](docs/architecture/03-design-decisions.md) ·
[CodeGraph & persistence](docs/architecture/04-codegraph-and-persistence.md)

## Stack

- **API** — Express 4, Node ≥ 18, ESM. Six runtime dependencies total.
- **LLM** — Groq (`llama-3.3-70b-versatile`, streamed) · also OpenAI, Anthropic, Gemini, or a
  zero-key mock. One env var switches.
- **Embeddings** — Gemini `gemini-embedding-001` (768-dim, L2-normalised) · OpenAI · mock.
- **Persistence** — Node's built-in `node:sqlite` (zero external services) or Postgres.
- **Frontend** — Next.js 16, React 19, Tailwind 4, Mermaid 11, `motion`.
- **Hardening** — helmet, per-IP rate limits, local-ingest guard, graceful shutdown, 31 tests.

## Layout

```
backend/     Express API + pipeline (routes / services / providers / db)
frontend/    Landing page (/) + workspace (/workspace)
evals/       Golden question set for the scorecard
docs/        Architecture, concepts, environment reference, interview prep
```

## License

MIT
