# Handoff — RepoLens

Hi! Here's everything you need to start contributing to this project.

## What this project does

An AI tool that **explains any codebase** and **generates architecture diagrams**. You point it at a GitHub repo or local folder; the backend ingests the code, chunks it, builds a vector index, and answers natural-language questions using RAG (Retrieval-Augmented Generation).

```
Next.js frontend ──HTTP──> Express backend ──> Ingestion → Parser → Chunker → Embeddings → Vector Store
(chat + diagrams)                                                                              │
                                                               Question ──> RAG ──> LLM ──────┘
```

---

## Repo layout

```
backend/      Node.js + Express API + full AI pipeline (Aditya's part — do not modify)
frontend/     Next.js app (your part — already scaffolded, see below)
docs/         Architecture + concept docs
for-teammate/ This folder — your starting point
```

---

## Your parts

### 1. Frontend (`frontend/`)

A Next.js 14 app with three panels:

| Component | File | What it does |
|-----------|------|--------------|
| RepoInput | `frontend/components/RepoInput.js` | Text field + button to ingest a GitHub URL or local path |
| Chat | `frontend/components/Chat.js` | Message thread; sends questions to `/api/ask`; shows source citations |
| DiagramViewer | `frontend/components/DiagramViewer.js` | Tabs (Architecture / Dependencies); fetches Mermaid from `/api/diagram`; renders with mermaid.js |

The full frontend is already written and working. Your job is to:
- Run it locally (see below)
- Test it against the backend
- Add enhancements (see suggestions at the bottom)
- Commit it under your name

### 2. Diagram service (`backend/src/services/diagram.js` + `backend/src/routes/diagram.js`)

Both files are already written and included in this repo. The backend mounts the diagram route **automatically** once those files exist (it checks at startup). You don't need to touch any of Aditya's files.

---

## How to run locally

### Step 1 — start the backend (Aditya's part)

```bash
cd backend
cp .env.example .env        # leave AI_PROVIDER=mock for now
npm install
npm run dev                 # http://localhost:4000
```

Verify it's healthy:
```bash
curl http://localhost:4000/api/health
# → {"status":"ok","uptime":...}
```

### Step 2 — start the frontend (your part)

```bash
cd frontend
cp .env.local.example .env.local    # sets NEXT_PUBLIC_API_BASE=http://localhost:4000
npm install
npm run dev                          # http://localhost:3000
```

Open `http://localhost:3000` in your browser.

### Step 3 — test the full flow

1. Paste a GitHub URL (e.g. `https://github.com/expressjs/express`) into the repo input and click **Analyze**.
2. Wait for indexing (10–30 seconds for small repos).
3. Ask a question: *"How does routing work?"*
4. Click the **Architecture** or **Dependencies** tab to see the diagram.

---

## API endpoints you consume

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/status` | Is a codebase indexed? → `{ indexed: bool, codebase: {...} }` |
| `POST` | `/api/ingest` | Body: `{ "source": "<github-url-or-local-path>" }` |
| `POST` | `/api/ask` | Body: `{ "question": "..." }` → `{ answer, sources: [{relPath, startLine, endLine, score, preview}] }` |
| `GET` | `/api/diagram` | `?type=architecture\|dependency\|module&relPath=...` → `{ mermaid: "..." }` |
| `GET` | `/api/files` | Lists all indexed files with chunk counts |

Full response shapes are documented in `docs/architecture/02-request-lifecycle.md`.

---

## How to commit your parts

After pulling the repo and running locally:

```bash
# 1. Pull Aditya's committed backend first
git pull origin main

# 2. Work on a feature branch
git checkout -b feature/frontend-and-diagrams

# 3. Commit the diagram service (backend)
git add backend/src/services/diagram.js backend/src/routes/diagram.js
git commit -m "feat(diagram): Mermaid diagram-generation service and route"

# 4. Commit the frontend
git add frontend/
git commit -m "feat(frontend): Next.js repo input, chat UI, and diagram viewer"

# 5. Push and open a PR
git push -u origin feature/frontend-and-diagrams
```

---

## Suggested enhancements (pick any)

### Frontend
- [ ] **Streaming responses** — use `fetch` with `ReadableStream` to show the LLM's answer token-by-token
- [ ] **File browser** — call `GET /api/files` to show a sidebar tree of indexed files; clicking one triggers a `module` diagram
- [ ] **Syntax highlighting** — wrap source previews in a `<pre>` with `highlight.js` or `shiki`
- [ ] **Dark mode** — add a toggle that switches a `data-theme` attribute on `<html>` and use CSS variables
- [ ] **Copy button** on code blocks in answers
- [ ] **Loading skeleton** instead of plain "Thinking…" text

### Diagram
- [ ] **Click-to-ask** — clicking a node in the diagram auto-asks "Explain the `<module>` module"
- [ ] **Zoom & pan** — wrap the Mermaid SVG in a pan-zoom library (e.g. `svg-pan-zoom`)
- [ ] **Export PNG** — add a download button that calls `mermaid.render()` and creates a blob URL

---

## Project dependencies (your side)

```json
"next": "^14.2.5",
"react": "^18.3.1",
"react-dom": "^18.3.1",
"mermaid": "^11.2.0"
```

No other dependencies are required. The frontend is intentionally lightweight.

---

## Questions?

- Architecture questions → read `docs/architecture/01-system-overview.md`
- API details → `docs/architecture/02-request-lifecycle.md`
- Why these design choices → `docs/architecture/03-design-decisions.md`
