# 02 — Request lifecycle

This traces exactly what happens inside the backend for the two key requests, file by file.

## `POST /api/ingest`  — building the index

Body: `{ "source": "<github url>" }` or `{ "path": "<local folder>" }`.

1. **`routes/ingest.js`** receives the request. `asyncHandler` wraps the handler so any thrown error
   reaches the central error middleware instead of hanging the request.
2. **`services/ingestion.js` → `ingestSource()`**
   - If the source looks like a URL, `git clone --depth 1` into a temp dir; else resolve the local
     path.
   - `walk()` recurses the tree, skipping ignored dirs (`node_modules`, `.git`, …), non-source
     extensions, lockfiles, oversized files, and binary files (NULL-byte heuristic).
   - Returns `documents: [{ path, relPath, ext, content }]`.
3. **`services/parser.js` → `parseDocuments()`** adds `language` (from extension) and `symbols`
   (regex-extracted function/class names) to each document.
4. **`services/chunker.js` → `chunkDocuments()`** splits each file into overlapping, line-aware
   chunks `{ id, relPath, language, text, startLine, endLine }`.
5. **`services/embeddings/index.js` → `embedTexts()`** turns every chunk's text into a vector using
   the selected provider (mock by default).
6. **`state.js`** — `resetIndex()` clears the old index; each chunk + vector + metadata is `add()`-ed
   to the `VectorStore`. `appState.codebase` records `{ source, fileCount, chunkCount, ingestedAt }`.
7. Response: `{ message, codebase }`.

## `POST /api/ask`  — answering a question

Body: `{ "question": "...", "topK"?: n }`.

1. **`routes/ask.js`** validates `question`, calls the RAG engine.
2. **`services/rag.js` → `answerQuestion()`**
   - Guard: 409 if nothing is indexed.
   - `embedQuery(question)` → the question vector (same space as the chunks).
   - `appState.vectorStore.search(queryVector, topK)` → top-K chunks by cosine similarity.
   - `buildPrompt()` assembles the retrieved code blocks + the question.
   - `complete({ system, prompt, context })` calls the LLM provider (mock by default).
   - Returns `{ answer, model, sources[] }` — sources carry `relPath`, line range, score, preview.
3. **`routes/ask.js`** sends the JSON straight back.

## Cross-cutting middleware

- **CORS** restricts which origins (the frontend) may call the API.
- **`express.json()`** parses request bodies.
- **Request logger** logs method, path, status, duration.
- **`notFound` + `errorHandler`** give every error a consistent JSON shape and correct status code.

## Sequence (ask)

```
Client ─POST /api/ask─▶ ask.js ─▶ rag.answerQuestion
                                     │ embedQuery
                                     ▼
                                 embeddings provider ──▶ vector
                                     │ vectorStore.search(vector, K)
                                     ▼
                                 top-K chunks
                                     │ buildPrompt
                                     ▼
                                 llm.complete ──▶ answer
Client ◀──── { answer, sources } ───┘
```

## Interview Q&A

**Q: How does an error in an async handler get turned into an HTTP 4xx/5xx?**
`asyncHandler` wraps the promise and forwards rejections to `next(err)`; the `errorHandler`
middleware reads `err.status` (set via `ApiError`) and formats the JSON response.

**Q: Why embed the question with the same provider as the chunks?**
Similarity is only meaningful within one vector space. Query and documents must be produced by the
same embedding model/function, or distances are meaningless.
