# Codebase Knowledge AI

An AI tool that can **explain any concept in a codebase** and **generate diagrams** of how the
code flows. Point it at a repository; it ingests the code, indexes it for semantic search, and
answers natural-language questions ("How does authentication work?", "What calls `processPayment`?")
with grounded explanations and Mermaid diagrams.

> Status: scaffold + working pipeline with a **mock AI provider**. Swap in a real LLM/embeddings
> provider (OpenAI, Anthropic, local, …) by editing one file — see `docs/concepts/06-llm-provider-abstraction.md`.

## What it does

1. **Ingest** a GitHub repo or local folder → reads source files.
2. **Parse + chunk** each file into retrievable pieces with metadata.
3. **Embed** chunks into vectors and store them in a vector index.
4. **Ask** a question → retrieve the most relevant chunks → an LLM explains the answer, grounded in
   real code, citing the files it used. (Retrieval-Augmented Generation, "RAG".)
5. **Diagram** the flow → generate Mermaid diagrams of architecture / dependencies.

## Architecture (high level)

```
Next.js frontend  ──HTTP──>  Express backend  ──>  Ingestion → Parser → Chunker
   (chat + diagrams)                                      │
                                                          ▼
                                          Embeddings ──> Vector Store
                                                          │
                                          Question ──> RAG engine ──> LLM provider
                                                          │
                                                          ▼
                                                    Answer + sources + diagram
```

Full detail: [`docs/architecture/01-system-overview.md`](docs/architecture/01-system-overview.md).

## Repository layout

```
backend/      Express API + the AI pipeline (ingestion, chunking, embeddings, vector store, RAG)
frontend/     Next.js app (repo input, chat UI, diagram viewer)   [teammate-owned]
docs/         Interview-ready concept deep-dives + architecture/design docs
COMMITS.md    Exact git commands to commit each part to GitHub
SHARE_WITH_TEAMMATE.md   What to hand to the teammate and how
```

## Ownership

This is a two-person project. See `SHARE_WITH_TEAMMATE.md` for the full split.

- **Aditya (committed):** scaffold, docs, Express core, ingestion, parsing/chunking, embeddings +
  vector store, RAG engine.
- **Teammate (shared as code to edit & commit herself):** diagram-generation service, Next.js frontend.

## Quick start (backend)

```bash
cd backend
cp .env.example .env
npm install
npm run dev        # starts the API on http://localhost:4000
```

Then try the pipeline with the mock provider:

```bash
# 1. Ingest this repo itself
curl -X POST http://localhost:4000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"path": "../"}'

# 2. Ask a question
curl -X POST http://localhost:4000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How does the chunker work?"}'
```

## Tech stack

- **Backend:** Node.js, Express
- **Frontend:** Next.js (React)
- **AI:** provider-agnostic embeddings + LLM interfaces (mock provider included; real one added later)
- **Diagrams:** Mermaid
