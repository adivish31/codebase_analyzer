# 07 — Behavioral: How to Tell This Project's Story

Behavioral questions are won or lost on structure and specificity. This file gives you the
story, the framing, and word-for-word answers for the most common questions.

---

## The two-sentence project pitch

> "I built an AI tool that lets engineers ask natural-language questions about any codebase and
> get grounded answers with file citations. It uses RAG — retrieving the most relevant code
> chunks via semantic search, then having an LLM explain them — rather than fine-tuning, so
> it works on any repo immediately and the answers are verifiable."

Use this as the opener for any question that asks "what did you build?"

---

## STAR format stories

### "Tell me about a technical challenge you faced."

**Situation:** We needed the project to run without API keys so anyone could demo it — but the
AI components (embeddings and LLM) are the core of the system.

**Task:** Build a mock provider that's realistic enough to prove the pipeline works, but without
any external dependency.

**Action:** I designed a provider interface (two facades: `embeddings/index.js` and
`providers/llm/index.js`) where the concrete implementation is selected by an environment variable.
The mock embeddings provider uses an FNV-1a hash to convert each word-token into a bucket in a
256-dim vector, then L2-normalises — capturing real lexical overlap without any API calls. The mock
LLM summarises the retrieved context chunks instead of calling a model.

**Result:** The full RAG pipeline — ingest, chunk, embed, retrieve, answer — works end-to-end
with zero API keys. Swapping to a real provider later is a single env-var change. I also added
OpenAI and Anthropic providers so the project can be used in production immediately.

---

### "Describe a design decision you made and its trade-offs."

**Situation:** I needed to ingest files from GitHub repos during the HTTP request cycle.

**Task:** Get a working ingestion pipeline that's simple enough to explain in an interview but
honest about its limitations.

**Action:** I used `git clone --depth 1` via Node's `execFile` — a shallow clone into a temp
directory. Shallow clone fetches only the latest tree (not history), so it's much faster. I
used `execFile` (not `exec`) specifically to avoid shell injection since the URL is user-provided.
After reading all files into memory, I clean up the temp directory immediately.

**Trade-offs I acknowledged:** this runs synchronously in the HTTP request, so it blocks for
large repos. The right production design is a background job queue (BullMQ), but I consciously
deferred that to keep the code teachable for a demo.

---

### "How did you work with a teammate on this project?"

**Situation:** We split the project between backend (me) and frontend + diagram generation (teammate).
The backend needed to work standalone while she built her parts.

**Task:** Design a clean interface that let her contribute without touching my files.

**Action:** I made the diagram route optional — `app.js` uses dynamic `import()` to load
`routes/diagram.js` only if the file exists. If it doesn't, the server logs a note and runs
without it. This means my backend deploys and demos fine before her code exists.

I also wrote `SHARE_WITH_TEAMMATE.md` and `for-teammate/HANDOFF.md` with explicit API contracts,
setup steps, and the exact git commands to commit her parts. I defined the data shapes my routes
return (`/api/diagram → { mermaid: string, type: string }`) so she could build the frontend
against a stable contract.

**Result:** We could develop in parallel with no integration surprises. Her diagram viewer just
called `GET /api/diagram?type=architecture` — a contract I defined and she consumed.

---

### "Tell me about a time you made a mistake or something you'd do differently."

**Situation:** I wrote all the ingestion logic as a synchronous, blocking HTTP handler.

**Task:** Deliver a working demo on time, but I underestimated how much this would hurt for
larger repos.

**Action:** During testing with a large repo (~3000 files), ingestion took 45 seconds and the
HTTP connection timed out. I had to quickly add a timeout extension and warn users to expect
a delay.

**What I'd do differently:** Start with a background job queue (BullMQ + Redis) from day one.
The HTTP endpoint would immediately return a `jobId`, and the frontend would poll `/api/ingest/status/:jobId`.
This would handle any size repo, allow progress reporting, and be retryable on failure.
The design for this is already documented in `docs/interview-prep/06-production-hardening.md`.

---

### "What was the most interesting thing you learned?"

**Answer:**
The biggest surprise was how much retrieval quality depends on chunking, not the LLM. I initially
assumed that swapping from a mock LLM to a real one (GPT-4o-mini) would dramatically improve
answer quality. It did — but only when the right code chunks were retrieved.

For several questions, even GPT-4o-mini gave poor answers because the sliding-window chunker
split a function across a chunk boundary. The model was trying to explain half a function. When
I increased the chunk overlap, those answers immediately improved without changing the LLM at all.

This made me understand that in RAG systems, the LLM is actually the easy part — the hard part is
getting the right context in front of it. The bottleneck is retrieval, not generation.

---

### "Why did you choose Node.js + Express over [Python/FastAPI/etc.]?"

**Answer:**
A few reasons. First, the frontend is Next.js (JavaScript), so a JavaScript backend keeps the
team's context unified — one language across the stack.

Second, Express is famously transparent — there's no magic. Middleware, routing, error handling
are all explicit. In an interview context, I can explain every line without hiding behind a
framework.

Third, Node's `fetch` (native in v18+) is all I need for OpenAI/Anthropic API calls, and the
`fs` module handles file reading. The project genuinely doesn't need a language with better
data-science libraries (like Python's numpy/pandas) because the vector math is simple enough
to implement from scratch — which I did to show I understand it.

Trade-off I acknowledge: Python has a richer ML ecosystem (langchain, transformers, sentence-transformers).
For a production RAG system with local model inference, Python would be the right call.

---

## Common "gotcha" questions and honest answers

**"Is your vector search actually good?"**
No — the mock provider uses hashing, not trained embeddings. It captures lexical overlap (shared
words), not semantic meaning. Switching to `text-embedding-3-small` makes it genuinely useful
for natural-language questions. I designed it this way deliberately so the project can be understood
and demoed without API keys, and the swap is a single env-var change.

**"What's the real bottleneck in this system?"**
Currently: LLM latency (500ms–2s per answer). Ingestion is slow for large repos but is a one-time
cost. At scale, the next bottleneck would be embedding batch size limits and vector search O(n·d).

**"Can this handle a 100k-line codebase?"**
Yes, but ingestion takes 3–10 minutes (cloning + embedding ~2000 chunks). Answers still return
in < 3 seconds because vector search is fast at that scale. For a 1M-line repo you'd need:
incremental indexing, a faster embedding provider (batched, parallel), and an ANN vector DB.

**"What does 'retrieval-augmented' mean, exactly?"**
The LLM doesn't answer from memory — it answers from retrieved evidence. "Augmented" means
augmenting the model's knowledge at inference time, not at training time. It's the difference
between a lawyer arguing from memory and a lawyer who looks up the relevant statute before answering.

---

## One-sentence answers to rapid-fire questions

| Question | Answer |
|----------|--------|
| What is RAG? | Retrieve relevant context, stuff it into the prompt, ask the LLM to answer from it |
| What is a vector embedding? | A dense float array where distance encodes semantic similarity |
| Why chunk? | Embedding models have token limits; chunking makes files indexable and retrievable in pieces |
| What is cosine similarity? | A·B / (‖A‖‖B‖) — 1 means identical direction, 0 means unrelated |
| Why overlap in chunking? | Prevents a concept that straddles a boundary from disappearing between chunks |
| What is top-K? | Retrieve the K most similar chunks; trade-off between context coverage and noise |
| What is HNSW? | A graph-based ANN algorithm for sub-linear nearest-neighbour search |
| What is the event loop? | Node's mechanism for handling async I/O without blocking the thread |
| What is asyncHandler? | A wrapper that catches async route errors and forwards them to Express's error handler |
| What is a system prompt? | Instructions given to an LLM before user messages, setting persona and constraints |
| What is temperature? | A sampling parameter — low (0) = deterministic, high (1) = diverse/random |
| What is hallucination? | An LLM generating confident but incorrect information not in its context |
