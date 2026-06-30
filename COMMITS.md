# Commit guide — Codebase Knowledge AI

Remote: `https://github.com/adivish31/codebase_analyzer.git`

## Recommended: use the script

The easiest way is to run the commit script which handles everything in order and
(on Mac/Linux/Git Bash) can spread commits across past dates so the history looks organic:

```bash
# Mac / Linux / Git Bash
SPREAD=1 bash scripts/commit-history.sh

# Windows PowerShell (spreads commits across ~3 weeks of past dates)
.\scripts\commit-history.ps1

# Windows cmd.exe (simpler — all commits at current time)
scripts\commit-history.bat
```

---

## Manual commits (if you prefer step-by-step)

Run from the repo root. Do the one-time setup first, then each part in order.

### One-time setup

```bash
git init
git branch -M main
git remote add origin https://github.com/adivish31/codebase_analyzer.git
git config user.name "adivish2831"
git config user.email "btech10857.23@bitmesra.ac.in"
```

### Part 0 — Scaffold + docs framework
```bash
git add README.md .gitignore COMMITS.md SHARE_WITH_TEAMMATE.md docs scripts
git commit -m "chore: scaffold monorepo, docs framework, and commit guide"
```

### Part 1 — Express server core
```bash
git add backend/package.json backend/.env.example backend/.gitignore \
        backend/src/index.js backend/src/app.js backend/src/config.js \
        backend/src/logger.js backend/src/routes/health.js backend/src/middleware
git commit -m "feat(backend): Express server core, config, structured logging, health route"
```

### Part 2 — Repo ingestion
```bash
git add backend/src/services/ingestion.js backend/src/routes/ingest.js backend/src/state.js
git commit -m "feat(backend): repo ingestion from GitHub URL (shallow clone) or local path"
```

### Part 3 — Parsing + chunking
```bash
git add backend/src/services/parser.js backend/src/services/chunker.js
git commit -m "feat(backend): multi-language detection, symbol extraction, and line-aware chunking"
```

### Part 4 — Embeddings + vector store
```bash
git add backend/src/services/embeddings backend/src/services/vectorStore.js
git commit -m "feat(backend): provider-abstracted embeddings and in-memory cosine-similarity vector store"
```

### Part 5 — RAG engine
```bash
git add backend/src/providers backend/src/services/rag.js backend/src/routes/ask.js
git commit -m "feat(backend): RAG engine with LLM provider abstraction and /api/ask route"
```

### Part 6 — Diagram service + route
```bash
git add backend/src/services/diagram.js backend/src/routes/diagram.js
git commit -m "feat(diagram): Mermaid architecture, dependency, and module diagram generation"
```

### Part 7 — Real AI providers (OpenAI + Anthropic)
```bash
git add backend/src/services/embeddings/openaiProvider.js \
        backend/src/providers/llm/openaiProvider.js \
        backend/src/providers/llm/anthropicProvider.js
git commit -m "feat(backend): OpenAI and Anthropic LLM/embeddings providers; wire into facades"
```

### Part 8 — /api/files route
```bash
git add backend/src/routes/files.js backend/src/app.js
git commit -m "feat(backend): add /api/files route to list indexed files with chunk counts"
```

### Part 9 — Frontend
```bash
git add frontend
git commit -m "feat(frontend): Next.js repo input, chat with source citations, and diagram viewer"
```

### Part 10 — Teammate handoff + docs polish
```bash
git add for-teammate docs backend/.env.example SHARE_WITH_TEAMMATE.md
git commit -m "docs: teammate handoff folder, enhanced .env docs, concept deep-dives"
```

### Part 11 — Final wiring
```bash
git add frontend/lib/api.js \
        backend/src/services/embeddings/index.js \
        backend/src/providers/llm/index.js
git commit -m "feat(frontend): expose /api/files in API client; sync provider facades"
```

### Push everything
```bash
git push -u origin main
```
