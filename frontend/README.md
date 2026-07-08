# Frontend — RepoLens  *(teammate-owned)*

Next.js (App Router) UI: ingest a repo, ask questions, and view Mermaid diagrams.

## Run

```bash
cp .env.local.example .env.local   # points at the backend (default http://localhost:4000)
npm install
npm run dev                        # http://localhost:3000
```

The Express backend must be running first (`cd ../backend && npm run dev`).

## Structure

```
app/
  layout.js        shell + global styles
  page.js          composes the three panels; tracks "is a codebase indexed?"
  globals.css      styling
components/
  RepoInput.js     ingest a GitHub URL / local path
  Chat.js          Q&A with source citations
  DiagramViewer.js fetches Mermaid source and renders it client-side
lib/
  api.js           fetch wrapper for the backend API
```

## Ideas to extend

Streaming answers, syntax highlighting in source previews, clicking a diagram node to ask about
that file, a file tree browser.
