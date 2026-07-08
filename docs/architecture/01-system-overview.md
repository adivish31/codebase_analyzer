# 01 — System overview

## What the system does

RepoLens takes a repository and lets a user (a) ask natural-language questions about
the code and get answers grounded in the actual source, and (b) view diagrams of the code's
structure. It is a **RAG application** (Retrieval-Augmented Generation) specialised for source code,
plus a diagram generator.

## Components and responsibilities

| Component | Tech | Responsibility |
|-----------|------|----------------|
| Frontend | Next.js (React) | Repo input, chat UI, diagram rendering. Talks to the backend over HTTP/JSON. |
| Backend API | Express (Node) | HTTP surface; orchestrates the pipeline; holds the in-memory index. |
| Ingestion | Node `fs` / `git` | Reads a local folder or shallow-clones a GitHub repo into source documents. |
| Parser | regex heuristics | Adds language + declared-symbol metadata to each file. |
| Chunker | sliding window | Splits files into overlapping, line-tracked chunks. |
| Embeddings | provider interface (mock now) | Turns chunk text into vectors. |
| Vector store | in-memory + cosine | Stores chunk vectors; returns nearest chunks for a query. |
| RAG engine | orchestration | Embeds the question, retrieves chunks, builds a prompt, calls the LLM. |
| LLM provider | provider interface (mock now) | Produces the natural-language answer. |
| Diagram service | regex + Mermaid | Builds architecture/dependency diagrams. *(teammate-owned)* |

## The two flows

**Ingest flow** (build the index):

```
source ──▶ Ingestion ──▶ Parser ──▶ Chunker ──▶ Embeddings ──▶ Vector store
(URL/path)   files       +lang/symbols  chunks      vectors        (indexed)
```

**Ask flow** (answer a question):

```
question ──▶ embed ──▶ vector search (top-K) ──▶ build prompt ──▶ LLM ──▶ answer + sources
```

## Why this shape

- **Pipeline of small services.** Each stage has one job and a plain function signature, so any
  stage can be tested, swapped, or upgraded in isolation (e.g. regex parser → tree-sitter AST).
- **Provider abstraction for AI.** Embeddings and LLM both sit behind a tiny interface. The app runs
  today on a deterministic mock; switching to OpenAI/Anthropic is a config + one-file change. This
  is what lets the placeholder exist without leaking through the codebase.
- **Stateless request handlers, state in one module.** Route handlers don't own data; the index
  lives in `state.js`. Swapping the in-memory store for a database later touches one module.

## Where state lives

For the scaffold everything is in memory (`appState`): the current codebase metadata and the vector
store. This keeps the project runnable with zero infrastructure. The design-decisions doc covers how
you'd make it persistent and multi-tenant.

## Interview Q&A

**Q: Walk me through the architecture.**
Frontend (Next.js) → Express API → a pipeline (ingest → parse → chunk → embed → store) that builds a
vector index, and a RAG path (embed question → retrieve → prompt → LLM) that answers questions. AI is
behind a provider interface so it's swappable.

**Q: Why separate the chunker, embedder, and store instead of one function?**
Single-responsibility: each is independently testable and replaceable. The store can become a real
vector DB, the embedder a real model, without touching the others.

**Q: What's the hardest part to scale?**
The vector store. Brute-force cosine is fine for thousands of chunks but O(n·d) per query; large
repos need an ANN index or managed vector DB. See concept doc 03.
