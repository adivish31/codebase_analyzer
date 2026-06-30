# Environment Variables Reference

Complete list of every environment variable the project reads, what it does, and which are
required for each mode. Backend vars go in `backend/.env` (copy from `backend/.env.example`).
Frontend vars go in `frontend/.env.local`.

---

## TL;DR — minimum to run

**Nothing.** With no `.env` at all, the backend runs in `mock` mode with `PERSIST=true` and is
fully functional (ingest, ask, graph, symbols, wiki, diagrams) — just with mock AI instead of a
real model. The only frontend var (`NEXT_PUBLIC_API_BASE`) defaults to `http://localhost:4000`.

---

## Backend variables (`backend/.env`)

### Server
| Variable | Default | Required? | Description |
|----------|---------|-----------|-------------|
| `PORT` | `4000` | No | Port the Express API listens on. |
| `NODE_ENV` | `development` | No | Standard Node environment flag. |
| `CORS_ORIGINS` | `http://localhost:3000` | No | Comma-separated origins allowed to call the API. Set to your frontend's deployed URL in production. |

### AI provider
| Variable | Default | Required? | Description |
|----------|---------|-----------|-------------|
| `AI_PROVIDER` | `mock` | No | `mock` \| `openai` \| `anthropic`. Selects embeddings + LLM implementation. |
| `OPENAI_API_KEY` | — | **Required if** `AI_PROVIDER=openai` (and for real embeddings under `anthropic`) | OpenAI key. Used for `text-embedding-3-small` + `gpt-4o-mini`. |
| `ANTHROPIC_API_KEY` | — | **Required if** `AI_PROVIDER=anthropic` | Anthropic key. Used for `claude-haiku-4-5` chat. |

> **Note on `anthropic` mode:** Anthropic has no embeddings API. Set `AI_PROVIDER=anthropic` for
> chat, but also provide `OPENAI_API_KEY` if you want real semantic embeddings — otherwise
> embeddings fall back to mock. The simplest single-key real setup is `AI_PROVIDER=openai`.

### GitHub (optional)
| Variable | Default | Required? | Description |
|----------|---------|-----------|-------------|
| `GITHUB_TOKEN` | — | Only for **private** repos | Personal Access Token (scope: `repo`). Public repos need nothing. The token is injected into the clone URL and never logged. |

### Persistence (RepoWiki DB + CodeGraph DB)
| Variable | Default | Required? | Description |
|----------|---------|-----------|-------------|
| `PERSIST` | `true` | No | `true` → SQLite DBs written to `DATA_DIR`, index reloads on restart. `false` → in-memory SQLite (nothing survives restart). |
| `DATA_DIR` | `./data` | No | Directory for `repowiki.db` and `codegraph.db` (relative to the backend's working dir). |

### Embedding / chunking / retrieval tuning
| Variable | Default | Required? | Description |
|----------|---------|-----------|-------------|
| `EMBEDDING_DIM` | `256` | No | Vector dimension for the **mock** provider only (real providers have fixed dims). |
| `CHUNK_SIZE` | `1200` | No | Approx characters per chunk. |
| `CHUNK_OVERLAP` | `200` | No | Trailing characters repeated at the start of the next chunk. |
| `TOP_K` | `5` | No | Chunks retrieved per question. |
| `HYBRID_RETRIEVAL` | `true` | No | Blend semantic search with keyword/symbol/path matching. |

### RepoWiki (per-file summaries)
| Variable | Default | Required? | Description |
|----------|---------|-----------|-------------|
| `WIKI_ENABLED` | `true` | No | Generate a summary card per file during ingest. |
| `WIKI_LLM` | `false` | No | Use the LLM to write summaries (needs a real provider, costs tokens). `false` = fast deterministic summaries from file structure. |
| `WIKI_MAX_FILES` | `300` | No | Cap how many files get summaries. |

### CodeGraph
| Variable | Default | Required? | Description |
|----------|---------|-----------|-------------|
| `GRAPH_MAX_NODES` | `300` | No | Max file nodes returned by `GET /api/graph`. |

---

## Frontend variables (`frontend/.env.local`)

| Variable | Default | Required? | Description |
|----------|---------|-----------|-------------|
| `NEXT_PUBLIC_API_BASE` | `http://localhost:4000` | No (set in prod) | Base URL of the Express backend. Must be the deployed backend URL in production. |

---

## Recommended configurations

### 1. Zero-cost demo (default)
```bash
# backend/.env — or no file at all
AI_PROVIDER=mock
PERSIST=true
```
Everything works; lexical (not deep-semantic) retrieval; data persists across restarts.

### 2. Real AI (single key, recommended)
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
PERSIST=true
WIKI_LLM=true          # optional: LLM-written file summaries
```
Real embeddings + real answers. Costs a few cents for a medium repo.

### 3. Claude for chat + OpenAI for embeddings
```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...   # for embeddings (Anthropic has none)
```

### 4. Private repo indexing
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...    # PAT with repo scope
```

### 5. Production / stateless workers
```bash
PERSIST=false           # if using an external store, or for ephemeral instances
CORS_ORIGINS=https://your-frontend.vercel.app
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

---

## What's required for "fully functional"

"Fully functional" depends on what you mean by it:

| Capability | Env needed |
|------------|-----------|
| Ingest, ask, graph, symbols, wiki, diagrams (mock AI) | **None** |
| Real semantic answers | `AI_PROVIDER=openai` + `OPENAI_API_KEY` |
| Index private GitHub repos | `GITHUB_TOKEN` |
| Survive restarts | `PERSIST=true` (default) |
| LLM-written wiki summaries | `WIKI_LLM=true` + a real provider |

So the single most impactful key is **`OPENAI_API_KEY`** (with `AI_PROVIDER=openai`). Everything
else has a sensible default.
