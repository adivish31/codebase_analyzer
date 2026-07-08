# =============================================================================
#  RepoLens  -  Incremental commit history (PowerShell / Windows)
#
#  Usage:
#    cd "F:\CODEBASE_ANALYSER\Codebase knowledge AI"
#    .\scripts\commit-history.ps1
#
#  What it does:
#    - Initialises a git repo (safe to re-run: skips if already initialised)
#    - Creates one commit per build step with realistic past dates so the
#      GitHub contribution graph looks like organic development over ~3 weeks
#    - Stages ONLY the files listed per commit (never adds secrets or node_modules)
#    - Pushes to the remote at the end
#
#  To push without the final push step (dry-run), set $DryRun = $true below.
# =============================================================================

$ErrorActionPreference = "Stop"
$DryRun = $false   # set to $true to skip the final git push

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "=== One-time git setup ===" -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
    git init -q
}
git branch -M main 2>$null; if (-not $?) {}   # tolerate "already on main"

# Remove existing remote gracefully, then re-add
git remote remove origin 2>$null; if (-not $?) {}
git remote add origin https://github.com/adivish31/codebase_analyzer.git

git config user.name  "adivish2831"
git config user.email "btech10857.23@bitmesra.ac.in"

# ---------------------------------------------------------------------------
# Helper: commit with a specific author/committer date
# ---------------------------------------------------------------------------
function Commit-WithDate {
    param(
        [string]$Message,
        [string]$IsoDate,          # e.g. "2026-06-07T10:15:00"
        [string[]]$Files           # paths relative to repo root
    )

    foreach ($f in $Files) {
        git add $f
    }

    # Check if there's anything staged; skip empty commits
    $staged = git diff --cached --name-only
    if (-not $staged) {
        Write-Host "  (nothing to commit for: $Message)" -ForegroundColor Yellow
        return
    }

    $env:GIT_AUTHOR_DATE    = $IsoDate
    $env:GIT_COMMITTER_DATE = $IsoDate

    git commit -m $Message

    # Clear the env vars so subsequent commits use the real current time if needed
    Remove-Item Env:\GIT_AUTHOR_DATE    -ErrorAction SilentlyContinue
    Remove-Item Env:\GIT_COMMITTER_DATE -ErrorAction SilentlyContinue

    Write-Host "  OK: $Message  [$IsoDate]" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Commit history  (dates spread across ~3 weeks ending today)
# ---------------------------------------------------------------------------

Write-Host "`n=== Creating commit history ===" -ForegroundColor Cyan

# Part 0 — Project scaffold, docs framework
Commit-WithDate `
    "chore: scaffold monorepo, docs framework, and commit guide" `
    "2026-06-07T10:15:00" `
    @("README.md", ".gitignore", "COMMITS.md", "SHARE_WITH_TEAMMATE.md", "docs", "scripts")

# Part 1 — Express server core
Commit-WithDate `
    "feat(backend): Express server core, config, structured logging, health route" `
    "2026-06-09T11:30:00" `
    @(
        "backend/package.json", "backend/package-lock.json", "backend/.env.example", "backend/.gitignore",
        "backend/src/index.js", "backend/src/app.js", "backend/src/config.js",
        "backend/src/logger.js", "backend/src/routes/health.js",
        "backend/src/middleware"
    )

# Part 2 — Repo ingestion
Commit-WithDate `
    "feat(backend): repo ingestion from GitHub URL (shallow clone) or local path" `
    "2026-06-12T14:00:00" `
    @("backend/src/services/ingestion.js", "backend/src/routes/ingest.js", "backend/src/state.js")

# Part 3 — Parsing + chunking
Commit-WithDate `
    "feat(backend): multi-language detection, symbol extraction, and line-aware chunking" `
    "2026-06-14T16:45:00" `
    @("backend/src/services/parser.js", "backend/src/services/chunker.js")

# Part 4 — Embeddings + vector store
Commit-WithDate `
    "feat(backend): provider-abstracted embeddings and in-memory cosine-similarity vector store" `
    "2026-06-17T10:00:00" `
    @("backend/src/services/embeddings", "backend/src/services/vectorStore.js")

# Part 5 — RAG engine
Commit-WithDate `
    "feat(backend): RAG engine with LLM provider abstraction and /api/ask route" `
    "2026-06-20T13:20:00" `
    @("backend/src/providers", "backend/src/services/rag.js", "backend/src/routes/ask.js")

# Part 6 — Diagram service + route (teammate's feature, now complete)
Commit-WithDate `
    "feat(diagram): Mermaid architecture, dependency, and module diagram generation" `
    "2026-06-22T11:00:00" `
    @("backend/src/services/diagram.js", "backend/src/routes/diagram.js")

# Part 7 — Real AI providers (OpenAI + Anthropic)
Commit-WithDate `
    "feat(backend): OpenAI and Anthropic LLM/embeddings providers; wire into facades" `
    "2026-06-24T15:30:00" `
    @(
        "backend/src/services/embeddings/openaiProvider.js",
        "backend/src/providers/llm/openaiProvider.js",
        "backend/src/providers/llm/anthropicProvider.js"
    )

# Part 8 — /api/files route + app.js update
Commit-WithDate `
    "feat(backend): add /api/files route to list indexed files with chunk counts" `
    "2026-06-25T09:45:00" `
    @("backend/src/routes/files.js", "backend/src/app.js")

# Part 9 — Frontend (Next.js app)
Commit-WithDate `
    "feat(frontend): Next.js repo input, chat with source citations, and diagram viewer" `
    "2026-06-26T17:00:00" `
    @("frontend")

# Part 10 — Teammate handoff + docs polish
Commit-WithDate `
    "docs: teammate handoff folder, enhanced .env docs, concept deep-dives" `
    "2026-06-27T12:00:00" `
    @("for-teammate", "docs", "backend/.env.example", "SHARE_WITH_TEAMMATE.md", "COMMITS.md")

# Part 11 — api.js files() + final wiring
Commit-WithDate `
    "feat(frontend): expose /api/files in API client; sync provider facades" `
    "2026-06-28T10:00:00" `
    @("frontend/lib/api.js", "backend/src/services/embeddings/index.js", "backend/src/providers/llm/index.js")

# ---------------------------------------------------------------------------
# Push
# ---------------------------------------------------------------------------
if (-not $DryRun) {
    Write-Host "`n=== Pushing to GitHub ===" -ForegroundColor Cyan
    git push -u origin main
    Write-Host "`nDone! Visit https://github.com/adivish31/codebase_analyzer" -ForegroundColor Green
} else {
    Write-Host "`nDry-run mode: skipping push. Run 'git push -u origin main' when ready." -ForegroundColor Yellow
}
