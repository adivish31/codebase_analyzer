# 01 — RAG: Retrieval-Augmented Generation

## The problem RAG solves

A language model only knows what was in its training data. It has never seen *your* repository, and
even if it had, you can't fit a whole codebase into a prompt. If you just ask "how does auth work in
my app?", the model will guess (hallucinate).

**RAG** fixes this by splitting the job in two:

1. **Retrieval** — find the few pieces of *your* data most relevant to the question.
2. **Generation** — give those pieces to the model as context and ask it to answer *using only
   them*.

The model becomes a reasoning/explanation engine over facts you supply, instead of a memory you hope
is correct.

## How it works in this project

```
question
  │  embed the question into a vector
  ▼
vector search over indexed code chunks  ──▶  top-K most similar chunks
  │  put those chunks into a prompt as "context"
  ▼
LLM: "Answer the question using ONLY this context, and cite files"
  ▼
answer + the source chunks it used
```

Code: `services/rag.js`. The retrieval uses the vector store (concept 03) built from embeddings
(concept 02) of chunks (concept 04). The generation calls the LLM provider (concept 06).

## Why retrieval before generation

- **Grounding** — answers cite real files/lines, so they're verifiable.
- **Freshness** — re-ingest the repo and answers update; no model retraining.
- **Cost/size** — you send 5 relevant chunks, not the whole repo.
- **Less hallucination** — the model is told to stick to the provided context.

## The key building blocks

- **Indexing (offline-ish):** ingest → chunk → embed → store. Done once per repo at `/api/ingest`.
- **Querying (per request):** embed question → search → prompt → generate. Done at `/api/ask`.
- **Top-K:** how many chunks to retrieve (`TOP_K`, default 5). Too few → missing context; too many →
  noise + cost.

## Things that make RAG good or bad

- **Chunking quality** (concept 04): bad boundaries → relevant code split awkwardly.
- **Embedding quality** (concept 02): weak embeddings → wrong chunks retrieved.
- **Prompt construction:** clearly separate context from the question and instruct grounding.
- **Retrieval depth (K)** and optional **re-ranking** of candidates.

## Interview Q&A

**Q: What is RAG in one sentence?**
Retrieve the most relevant pieces of an external knowledge source, then have an LLM generate an
answer grounded in those pieces.

**Q: Why not fine-tune the model on the codebase instead?**
Fine-tuning is expensive, slow to update, and still can't cite sources. RAG updates instantly on
re-ingest and gives verifiable citations.

**Q: Where can RAG go wrong?**
Retrieval brings back irrelevant or incomplete chunks (bad chunking/embeddings/low K), or the prompt
doesn't constrain the model to the context, so it still hallucinates.

**Q: How would you evaluate a RAG system?**
Separately measure retrieval (did the right chunks come back? recall@K) and generation (is the
answer faithful to the retrieved context? groundedness/faithfulness), plus end-to-end answer
correctness.
