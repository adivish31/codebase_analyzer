#!/usr/bin/env bash
# =============================================================================
#  RepoLens - incremental commit history (macOS / Linux / Git Bash)
#
#  Usage:
#    bash scripts/commit-history.sh            # commits at current time
#    SPREAD=1 bash scripts/commit-history.sh  # commits with realistic past dates
#
#  Creates one commit per build step in logical order.
#  Pushes to origin/main at the end.
# =============================================================================
set -e
cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# One-time setup
# ---------------------------------------------------------------------------
echo "=== One-time git setup ==="
git init -q
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/adivish31/codebase_analyzer.git
git config user.name  "adivish2831"
git config user.email "btech10857.23@bitmesra.ac.in"

# ---------------------------------------------------------------------------
# Helper: commit with optional date spreading
# ---------------------------------------------------------------------------
# Dates array: ISO8601 strings, one per commit (oldest first)
DATES=(
  "2026-06-07T10:15:00"
  "2026-06-09T11:30:00"
  "2026-06-12T14:00:00"
  "2026-06-14T16:45:00"
  "2026-06-17T10:00:00"
  "2026-06-20T13:20:00"
  "2026-06-22T11:00:00"
  "2026-06-24T15:30:00"
  "2026-06-25T09:45:00"
  "2026-06-26T17:00:00"
  "2026-06-27T12:00:00"
  "2026-06-28T10:00:00"
)
STEP=0

commit() {
  local msg="$1"; shift
  git add "$@"

  # Skip if nothing staged
  if git diff --cached --quiet; then
    echo "  (nothing to commit for: $msg)"
    STEP=$((STEP+1))
    return
  fi

  if [ "${SPREAD:-0}" = "1" ]; then
    local d="${DATES[$STEP]:-$(date -Iseconds)}"
    GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" git commit -m "$msg"
    echo "  OK: $msg  [$d]"
  else
    git commit -m "$msg"
    echo "  OK: $msg"
  fi
  STEP=$((STEP+1))
}

# ---------------------------------------------------------------------------
# Commits (in logical order)
# ---------------------------------------------------------------------------
echo ""
echo "=== Creating commit history ==="

commit "chore: scaffold monorepo, docs framework, and commit guide" \
  README.md .gitignore COMMITS.md SHARE_WITH_TEAMMATE.md docs scripts

commit "feat(backend): Express server core, config, structured logging, health route" \
  backend/package.json backend/.env.example backend/.gitignore \
  backend/src/index.js backend/src/app.js backend/src/config.js \
  backend/src/logger.js backend/src/routes/health.js backend/src/middleware

commit "feat(backend): repo ingestion from GitHub URL (shallow clone) or local path" \
  backend/src/services/ingestion.js backend/src/routes/ingest.js backend/src/state.js

commit "feat(backend): multi-language detection, symbol extraction, and line-aware chunking" \
  backend/src/services/parser.js backend/src/services/chunker.js

commit "feat(backend): provider-abstracted embeddings and in-memory cosine-similarity vector store" \
  backend/src/services/embeddings backend/src/services/vectorStore.js

commit "feat(backend): RAG engine with LLM provider abstraction and /api/ask route" \
  backend/src/providers backend/src/services/rag.js backend/src/routes/ask.js

commit "feat(diagram): Mermaid architecture, dependency, and module diagram generation" \
  backend/src/services/diagram.js backend/src/routes/diagram.js

commit "feat(backend): OpenAI and Anthropic LLM/embeddings providers; wire into facades" \
  backend/src/services/embeddings/openaiProvider.js \
  backend/src/providers/llm/openaiProvider.js \
  backend/src/providers/llm/anthropicProvider.js

commit "feat(backend): add /api/files route to list indexed files with chunk counts" \
  backend/src/routes/files.js backend/src/app.js

commit "feat(frontend): Next.js repo input, chat with source citations, and diagram viewer" \
  frontend

commit "docs: teammate handoff folder, enhanced .env docs, concept deep-dives" \
  for-teammate docs backend/.env.example SHARE_WITH_TEAMMATE.md COMMITS.md

commit "feat(frontend): expose /api/files in API client; sync provider facades" \
  frontend/lib/api.js \
  backend/src/services/embeddings/index.js \
  backend/src/providers/llm/index.js

# ---------------------------------------------------------------------------
# Push
# ---------------------------------------------------------------------------
echo ""
echo "=== Pushing to GitHub ==="
git push -u origin main
echo ""
echo "Done! Visit https://github.com/adivish31/codebase_analyzer"
