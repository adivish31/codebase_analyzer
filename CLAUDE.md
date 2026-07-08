# CLAUDE.md — RepoLens

Working notes for AI-assisted development. Keep this current when conventions or commands change.

## What this is

**RepoLens** — RAG-powered codebase explainer: ingest a GitHub repo or local folder → chunk + embed +
build a code graph (SQLite/Postgres) → ask questions, get **streamed** grounded answers with
`file:line` citations (deep-linked to GitHub at the indexed commit), symbol lookup, per-file wiki,
and Mermaid diagrams. Landing page at `/`, workspace at `/workspace`.

## Run / test / eval

```bash
# Backend (Express, port 4000)
cd backend
npm install
npm run dev            # node --watch src/index.js
npm test               # node --test  (31 tests: unit + full API integration)
npm run eval           # golden-set scorecard → prints table, rewrites README + frontend metrics

# Frontend (Next.js 16 + React 19 + Tailwind 4, port 3000)
cd frontend
npm install
npm run dev
```

No `.env` needed to run — defaults to `AI_PROVIDER=mock` + `PERSIST=true` (SQLite in `backend/data/`).
Full env reference: `docs/ENVIRONMENT.md`.

## Stack (actual — do not assume otherwise)

- **Backend:** Node ≥18.17 (Node 24 in dev), Express 4, ESM (`"type":"module"`).
  Deps: express, cors, dotenv, helmet, express-rate-limit, pg. Everything else is Node built-ins.
- **Persistence:** `node:sqlite` (built-in) by default; Postgres driver when `DATABASE_URL` set.
  Two stores: RepoWiki DB (chunks+vectors, wiki, meta) and CodeGraph DB (files, symbols, edges).
  Store interface is async; drivers live in `backend/src/db/` behind `db/index.js` factory.
- **Frontend:** Next.js 16 App Router (Turbopack), React 19, **Tailwind 4** with RepoLens design
  tokens in `app/globals.css` (dark-first, lime `#C6F24E` accent, mono `// 01` labels, hairline
  borders; a legacy compat layer styles older panel classes). Fonts via `next/font`: Space Grotesk
  (display) + Inter (body) + JetBrains Mono. Motion primitives hand-ported in `components/motion/`
  (`motion` package, reduced-motion aware). Mermaid 11 + highlight.js. Fetch + SSE client in
  `lib/api.js`. `lib/metrics.js` is machine-written by `npm run eval` — don't hand-edit numbers.
- **AI providers:** selected by `AI_PROVIDER` env — `mock` | `openai` | `anthropic` | `gemini` |
  `groq`. Facades: `services/embeddings/index.js` and `providers/llm/index.js`. All HTTP via
  native fetch (no vendor SDKs). Gemini embeddings are 768-dim, L2-normalised client-side, with
  429 backoff; Groq (`llama-3.3-70b-versatile`) streams tokens and backs off on free-tier TPM 429s.
  Groq/Anthropic have no embeddings API → embeddings fall back gemini → openai → mock.
- **Streaming:** `/api/ask/stream` and `/api/ingest/stream` are SSE-over-POST; the shared pipeline
  lives in `services/pipeline.js`, the answer cache in `services/queryCache.js` (in-process LRU,
  invalidated by index version — deliberately not Redis).

## Layout

```
backend/src/
  routes/      health ingest ask files graph wiki diagram   (thin HTTP layer)
  services/    ingestion parser chunker imports codeGraph repoWiki rag diagram vectorStore embeddings/
  providers/llm/   mock openai anthropic gemini
  db/          sqlite + postgres drivers, store factory
  state.js     appState singleton; initState() reloads persisted index on boot
backend/test/  node --test suites (run against real app via supertest-style fetch)
frontend/app/  layout.js page.js globals.css
frontend/components/  RepoInput Chat DiagramViewer CodeMap FileBrowser CodeBlock CopyButton
docs/          architecture/ concepts/ interview-prep/ ENVIRONMENT.md
```

## Conventions

- ESM everywhere; `.js` extensions in imports (required by Node ESM).
- Routes stay thin: validation + call service + `res.json`. Errors via `throw new ApiError(status, msg)`
  caught by `middleware/errorHandler.js`; async handlers wrapped in `asyncHandler`.
- Heavily commented "teachable" style — file-top block comments explain the *why*.
- State: single `appState` from `state.js`. Never `process.env` outside `config.js`.
- Frontend: client components (`'use client'`), panels as `<section className="panel">`,
  all styling in `globals.css`.
- Commits: conventional (`feat(backend): …`, `docs: …`), one concern per commit.

## Provider rules

- `AI_PROVIDER=mock` must always work with zero keys — never break this path.
- Anthropic has no embeddings API → anthropic mode uses OpenAI embeddings if key present, else mock.
- Gemini: `gemini-embedding-001`, `outputDimensionality: 768`, L2-normalise before store; never
  `text-embedding-004`.
- Adding a provider = one file per facade + a `case` in each `index.js` + `.env.example` + ENVIRONMENT.md.

## Gotchas

- `node:sqlite` prints an experimental warning — suppressed in `db/sqlite.js`; don't "fix" it.
- Vectors persist as JSON in SQLite/PG; search runs in-memory (rehydrated at boot by `initState`).
- Windows dev box: prefer PowerShell commands; Git Bash lacks `git` in PATH here. PowerShell 5.1's
  `Set-Content -Encoding utf8` writes a BOM that breaks Turbopack's package.json parser — write
  JSON via Node instead.
- Postgres tables are migrated with idempotent `ADD COLUMN IF NOT EXISTS` in the pg stores —
  `CREATE TABLE IF NOT EXISTS` alone won't upgrade an old schema.
- newer `lucide-react` removed brand icons (`Github` etc.) — use text links.
