# 02 — RAG Deep Dive

Everything you need to explain RAG convincingly in an interview — from first principles through
evaluation and production concerns.

---

## What problem RAG solves

An LLM is a fixed knowledge snapshot. It can't know:
- Your private codebase
- Anything after its training cutoff
- Very recent events or documents

**Naive approach:** paste the whole codebase into the prompt.
**Why it fails:** context windows are bounded (128K–200K tokens ≈ ~100K–150K words = a medium codebase). 
Even when they fit: (a) cost scales with tokens, (b) "lost in the middle" — the model attends
less to content in the middle of a very long prompt.

**RAG solution:** instead of pasting *everything*, retrieve *only the relevant pieces*.

---

## The full RAG pipeline

### Indexing phase (done once per data source)

```
Source files
   │
   ├─ [Ingestion]  Read & filter files
   │
   ├─ [Parsing]    Detect language, extract symbols
   │
   ├─ [Chunking]   Split into ~1200-char overlapping windows
   │
   ├─ [Embedding]  text → float vector  (batch API call or local model)
   │
   └─ [Vector Store]  upsert(id, vector, metadata)
```

### Query phase (per user question)

```
User question
   │
   ├─ [Embed query]       question → query vector
   │
   ├─ [Vector search]     cosine_search(query_vec, top_K) → ranked chunks
   │
   ├─ [Prompt assembly]   system_prompt + context_blocks + question
   │
   ├─ [LLM call]          complete(prompt) → answer tokens
   │
   └─ Response            { answer, sources }
```

---

## Chunking strategies (why it's the hardest part)

Retrieval quality is almost entirely determined by chunking. Bad chunks → wrong context → wrong answer.

### Sliding window (what this project uses)

```
lines 1-40   [chunk 0]
lines 35-75  [chunk 1]   ← 5-line overlap
lines 70-110 [chunk 2]
```

**Pros:** simple, language-agnostic, preserves line numbers.
**Cons:** may split a function halfway; no awareness of code structure.

### Syntax-aware chunking (tree-sitter)

Parse the AST; split on function/class/method declarations. Each chunk = one semantic unit.

```javascript
// tree-sitter node for a FunctionDeclaration → one chunk
function authenticate(token) { ... }
// next chunk starts at the next declaration
```

**Pros:** coherent chunks, better retrieval.
**Cons:** need a parser per language (tree-sitter supports ~100 languages).

### Sentence-window retrieval

Index single sentences but, at retrieval time, return the surrounding N sentences as context.
Good for documentation; less useful for code (sentences aren't a meaningful unit in code).

### Parent-document retrieval

Index small chunks for precise matching; when matched, retrieve the larger parent block.
```
Parent: entire function (500 lines)
Child:  each 5-line sub-block (indexed)
On match: return the parent, not the child
```

### Semantic chunking

Embed each sentence; split where cosine similarity between consecutive sentences drops sharply
(topic boundary). Expensive but produces the most coherent chunks.

---

## Embedding models — how to choose

| Model | Dim | Max tokens | Notes |
|-------|-----|------------|-------|
| `text-embedding-3-small` | 1536 | 8191 | Fast, cheap. Good default. |
| `text-embedding-3-large` | 3072 | 8191 | ~20% better on MTEB. 5× cost. |
| `text-embedding-ada-002` | 1536 | 8191 | Legacy, same price, worse quality. Don't use for new projects. |
| `voyage-code-3` | 1024 | 32K | Trained on code, beats text-embedding-3 on code retrieval. |
| `nomic-embed-text` | 768 | 8192 | Open, runs locally via Ollama. Good for private/air-gapped. |

**Rule of thumb:** start with `text-embedding-3-small`. If retrieval quality is poor on benchmarks,
try `voyage-code-3` for code or `text-embedding-3-large` for docs.

---

## Retrieval: what "top-K" actually means

You retrieve the K most similar chunks. Classic K = 5. The trade-off:

| K | Effect |
|---|--------|
| 1–3 | Low cost, may miss relevant context |
| 5–10 | Good balance for most use cases |
| 20+ | Higher recall, more noise, higher token cost, "lost in the middle" risk |

### MMR (Maximal Marginal Relevance)

Instead of top-K by score, pick chunks that are (a) relevant AND (b) diverse — avoid returning
5 nearly-identical chunks from the same file.

```
score(chunk, i) = λ × sim(query, chunk) - (1-λ) × max(sim(selected_j, chunk))
```

### Re-ranking

A second model (cross-encoder) scores each (query, chunk) pair together.
Bi-encoders are fast but miss fine-grained relevance; cross-encoders are slower but much more accurate.

Typical pipeline: retrieve top-20 with bi-encoder → re-rank with cross-encoder → take top-5.
Common re-rankers: `cross-encoder/ms-marco-MiniLM-L-6-v2`, Cohere Rerank, Jina Reranker.

---

## Prompt construction — getting it right

### What a good RAG prompt looks like

```
You are a senior engineer explaining a codebase. Answer the question using ONLY the provided 
code context. Cite files by their path. If the context is insufficient, say so plainly.

[Context 1] src/auth.js (lines 12-45, javascript)
```javascript
import jwt from 'jsonwebtoken';
export function verifyToken(token) { ... }
```

[Context 2] src/middleware/auth.js (lines 1-20, javascript)
```javascript
import { verifyToken } from '../auth.js';
export function requireAuth(req, res, next) { ... }
```

---
Question: How does authentication work?
```

### Key elements
1. **System instruction:** grounds the model, prevents hallucination outside context.
2. **Context blocks with metadata:** file path + line numbers for citability.
3. **Code fences with language:** helps the model understand code is code, not prose.
4. **Clear delimiter between context and question:** the `---` separator.
5. **"Say so if insufficient":** prevents the model making up an answer when context is irrelevant.

### Common mistakes
- Dumping context without metadata → model can't cite sources
- No grounding instruction → model supplements with training knowledge
- Very long chunks → model loses focus on later chunks
- Temperature 1.0 → random, inconsistent answers for factual Q&A

---

## Evaluation

### How to measure retrieval quality

**Recall@K:** what fraction of the time is at least one relevant chunk in the top-K?
```
recall@5 = (questions where a relevant chunk is in top-5) / (total questions)
```
Target: > 0.80 for a good retrieval system.

**MRR (Mean Reciprocal Rank):** average of 1/rank_of_first_relevant_chunk. Penalises
good chunks ranked low.

**NDCG:** weights by rank position — top result counts more than fifth result.

### How to measure generation quality

**Faithfulness:** is the answer supported by the retrieved context? (Run an LLM judge:
"Does this answer follow only from this context?")

**Answer correctness:** is the answer actually right? Needs ground-truth Q&A pairs.

**Context relevance:** are the retrieved chunks actually relevant to the question?

### Practical eval setup

1. Build a small dataset of 50–100 question/answer pairs manually (golden set).
2. Run the pipeline; collect retrieved chunks and generated answers.
3. Compute recall@K on retrieved chunks (manual relevance labels).
4. Use an LLM judge for faithfulness ("does this answer come from the context?").
5. Iterate on chunking, embedding model, K, and prompt until metrics improve.

Tools: **RAGAS** (open-source), **TruLens**, **DeepEval**, **Phoenix (Arize)**.

---

## Failure modes and fixes

| Failure | Symptom | Fix |
|---------|---------|-----|
| Wrong chunks retrieved | Answer is about wrong file | Better embedding model, hybrid search, re-ranking |
| Concept split at boundary | Partial code in chunk | Increase overlap or use syntax-aware chunking |
| LLM ignores context | Answer doesn't cite files | Stronger grounding instruction, lower temperature |
| Lost in the middle | Misses middle chunks | Re-rank + put top chunk first and last |
| Stale index | Old code cited | Webhook-triggered re-ingest on push |
| Context too long | LLM truncates or loses focus | Reduce K, use parent-document retrieval, compress context |
| Out-of-domain question | "How do I fix my computer?" | Add a classifier to detect off-topic questions before retrieval |

---

## Advanced patterns

### HyDE (Hypothetical Document Embedding)

Generate a *hypothetical answer* first, embed that, then search. The idea: the hypothetical
answer is in the same embedding space as relevant code, so it retrieves better than a short question.

```
question → LLM("write a hypothetical answer") → hypothetical_text
→ embed(hypothetical_text) → search
```

Works well when the question is ambiguous or short.

### Query decomposition

Break a complex question into sub-questions, retrieve for each, combine context.
```
"How does auth work and where is it called?"
→ ["How is auth implemented?", "Which routes use auth middleware?"]
→ retrieve for each → merge context → answer
```

### Iterative / agentic RAG

The LLM decides what to retrieve next:
1. Generate an initial answer.
2. Identify gaps: "I need to see how `processPayment` calls `validateCard`."
3. Retrieve more chunks for `validateCard`.
4. Refine the answer.
Useful for multi-hop questions. More complex, higher latency + cost.

---

## Interview Q&A — advanced

**Q: What is the difference between a bi-encoder and a cross-encoder?**
Bi-encoder: encode query and document separately → dot product (fast, can pre-compute doc embeddings).
Cross-encoder: encode (query, document) *jointly* → single relevance score (slower, higher quality).
RAG uses bi-encoders for retrieval (real-time), optionally followed by cross-encoder re-ranking.

**Q: Why does overlap help but too much overlap hurt?**
Overlap prevents concepts from being split. But too much overlap means many near-duplicate chunks —
wasted index space, and you return multiple nearly-identical chunks in top-K (diversity suffers).

**Q: When would you NOT use RAG?**
- The codebase is tiny (< 50 files) → just include it all in the prompt.
- You need the model to *reason across* the entire codebase (RAG retrieves a subset, missing global patterns).
- Strict latency < 100ms → embedding + search adds overhead; a cached keyword search might be faster.

**Q: How do you handle code vs. documentation in the same index?**
Weight or filter by file type. Code chunks carry different signals than docs. Some teams use
separate indexes (one for code, one for docs/comments) and merge results with a re-ranker.
