@echo off
REM =============================================================================
REM  Codebase Knowledge AI - incremental commit history (Windows cmd.exe)
REM
REM  Prefer the PowerShell version (commit-history.ps1) which spreads commits
REM  across realistic past dates. This .bat version commits everything now
REM  (all at the current time) but in the correct logical order.
REM
REM  Usage: double-click or run from repo root:
REM    scripts\commit-history.bat
REM =============================================================================
setlocal
cd /d "%~dp0.."

echo === One-time git setup ===
git init
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/adivish31/codebase_analyzer.git
git config user.name "adivish2831"
git config user.email "btech10857.23@bitmesra.ac.in"

echo.
echo === Part 0: scaffold + docs ===
git add README.md .gitignore COMMITS.md SHARE_WITH_TEAMMATE.md docs scripts
git commit -m "chore: scaffold monorepo, docs framework, and commit guide"

echo.
echo === Part 1: Express core ===
git add backend/package.json backend/.env.example backend/.gitignore ^
        backend/src/index.js backend/src/app.js backend/src/config.js ^
        backend/src/logger.js backend/src/routes/health.js backend/src/middleware
git commit -m "feat(backend): Express server core, config, structured logging, health route"

echo.
echo === Part 2: ingestion ===
git add backend/src/services/ingestion.js backend/src/routes/ingest.js backend/src/state.js
git commit -m "feat(backend): repo ingestion from GitHub URL (shallow clone) or local path"

echo.
echo === Part 3: parsing + chunking ===
git add backend/src/services/parser.js backend/src/services/chunker.js
git commit -m "feat(backend): multi-language detection, symbol extraction, and line-aware chunking"

echo.
echo === Part 4: embeddings + vector store ===
git add backend/src/services/embeddings backend/src/services/vectorStore.js
git commit -m "feat(backend): provider-abstracted embeddings and in-memory cosine-similarity vector store"

echo.
echo === Part 5: RAG engine ===
git add backend/src/providers backend/src/services/rag.js backend/src/routes/ask.js
git commit -m "feat(backend): RAG engine with LLM provider abstraction and /api/ask route"

echo.
echo === Part 6: diagram service + route ===
git add backend/src/services/diagram.js backend/src/routes/diagram.js
git commit -m "feat(diagram): Mermaid architecture, dependency, and module diagram generation"

echo.
echo === Part 7: real AI providers ===
git add backend/src/services/embeddings/openaiProvider.js ^
        backend/src/providers/llm/openaiProvider.js ^
        backend/src/providers/llm/anthropicProvider.js
git commit -m "feat(backend): OpenAI and Anthropic LLM/embeddings providers; wire into facades"

echo.
echo === Part 8: /api/files route ===
git add backend/src/routes/files.js backend/src/app.js
git commit -m "feat(backend): add /api/files route to list indexed files with chunk counts"

echo.
echo === Part 9: frontend ===
git add frontend
git commit -m "feat(frontend): Next.js repo input, chat with source citations, and diagram viewer"

echo.
echo === Part 10: handoff + docs polish ===
git add for-teammate docs backend/.env.example SHARE_WITH_TEAMMATE.md
git commit -m "docs: teammate handoff folder, enhanced .env docs, concept deep-dives"

echo.
echo === Part 11: final wiring ===
git add frontend/lib/api.js backend/src/services/embeddings/index.js backend/src/providers/llm/index.js
git commit -m "feat(frontend): expose /api/files in API client; sync provider facades"

echo.
echo === Pushing to GitHub ===
git push -u origin main

echo.
echo Done! Visit https://github.com/adivish31/codebase_analyzer
endlocal
pause
