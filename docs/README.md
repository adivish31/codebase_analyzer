# Documentation — Codebase Knowledge AI

This documentation is written to do double duty: explain how the project works **and** teach the
underlying concepts in interview-ready depth. Each concept doc ends with a **"Interview Q&A"**
section.

## Architecture & design (system-design rounds)

- [01 — System overview](architecture/01-system-overview.md) — components, responsibilities, data flow.
- [02 — Request lifecycle](architecture/02-request-lifecycle.md) — what happens on ingest and on ask.
- [03 — Design decisions & trade-offs](architecture/03-design-decisions.md) — why each choice was made.

## Concept deep-dives (technical rounds)

- [01 — RAG: Retrieval-Augmented Generation](concepts/01-rag.md)
- [02 — Embeddings & semantic similarity](concepts/02-embeddings.md)
- [03 — Vector stores & nearest-neighbour search](concepts/03-vector-search.md)
- [04 — Chunking strategies](concepts/04-chunking.md)
- [05 — Express & REST API design](concepts/05-express-rest.md)
- [06 — LLM provider abstraction (the placeholder pattern)](concepts/06-llm-provider-abstraction.md)

## Interview prep (deep-dive library)

Comprehensive prep material — go here after the architecture and concept docs.

- [00 — Master Q&A (60+ questions)](interview-prep/00-MASTER-QA.md) — self-quiz across all topics
- [01 — System design walkthrough](interview-prep/01-system-design-walkthrough.md) — how to whiteboard this system in 45 min
- [02 — RAG deep dive](interview-prep/02-rag-deep-dive.md) — full pipeline, chunking strategies, evaluation, advanced patterns
- [03 — Vector DB deep dive](interview-prep/03-vector-db-deep-dive.md) — HNSW, IVF, cosine math, pgvector SQL, DB comparison
- [04 — Node.js deep dive](interview-prep/04-nodejs-deep-dive.md) — event loop, async/await, ESM, fs, child processes, Express internals
- [05 — LLM fundamentals](interview-prep/05-llm-fundamentals.md) — tokens, context window, temperature, provider APIs, hallucination, streaming
- [06 — Production hardening](interview-prep/06-production-hardening.md) — background jobs, persistent store, auth, caching, rate limiting, observability
- [07 — Behavioral story guide](interview-prep/07-behavioral-project-story.md) — STAR stories, tough questions, one-sentence answers

## How to use this for interviews

**Recommended order:**
1. Read `architecture/01-system-overview.md` → whiteboard the system in your head
2. Skim `architecture/03-design-decisions.md` → know the trade-offs cold
3. Self-quiz with `interview-prep/00-MASTER-QA.md` → find your weak spots
4. Deep-dive those weak spots in the relevant file
5. Practice the behavioral story (`interview-prep/07-behavioral-project-story.md`) out loud
