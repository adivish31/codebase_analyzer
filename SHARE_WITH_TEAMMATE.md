# Hand-off to teammate

This file describes the parts I generated **for your teammate to edit and commit herself**. You can
share this whole repo with her, or just the folders/files listed below. Nothing here is committed by
you — she owns these commits.

## Her parts

| Part | Files | What it is |
|------|-------|------------|
| Diagram service | `backend/src/services/diagram.js`, `backend/src/routes/diagram.js` | Generates Mermaid diagrams (architecture, dependency, flow) from the ingested codebase. |
| Next.js frontend | `frontend/` (entire folder) | Repo input page, chat UI, and diagram viewer that talk to the Express API. |

## How the backend stays decoupled

`backend/src/app.js` mounts the diagram route **optionally**: if `backend/src/routes/diagram.js`
exists it is loaded, otherwise the server logs a note and runs without it. So your committed backend
works standalone, and her diagram route activates automatically once present. She doesn't need to
touch your files.

## How she should commit her parts

From the repo root, after you've pushed your parts:

```bash
git pull origin main
git checkout -b feature/frontend-and-diagrams      # work on a branch (recommended)

# diagram service
git add backend/src/services/diagram.js backend/src/routes/diagram.js
git commit -m "feat(diagram): Mermaid diagram-generation service and route"

# frontend
git add frontend/
git commit -m "feat(frontend): Next.js repo input, chat UI, and diagram viewer"

git push -u origin feature/frontend-and-diagrams
# then open a Pull Request on GitHub to merge into main
```

## Running her parts locally

```bash
# backend (yours) must be running first:
cd backend && npm run dev      # http://localhost:4000

# then frontend:
cd frontend && npm install && npm run dev   # http://localhost:3000
```

The frontend expects the API base URL in `frontend/.env.local`:

```
NEXT_PUBLIC_API_BASE=http://localhost:4000
```

## Suggested division of future work

- **You (Aditya):** backend pipeline depth — real embeddings provider, persistent vector store,
  better chunking, caching, tests.
- **Teammate:** frontend polish — streaming responses, diagram interactivity, file browser,
  syntax highlighting.
