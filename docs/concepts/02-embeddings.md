# 02 — Embeddings & semantic similarity

## What an embedding is

An **embedding** is a list of numbers (a vector) that represents a piece of text as a point in a
high-dimensional space. The crucial property: **texts with similar meaning map to nearby points.**
"login handler" and "authenticate user" land close together even though they share no words.

A real embedding model is a neural network trained so that semantically related inputs produce
vectors with high cosine similarity.

## How we use them

1. At ingest time, every code chunk is embedded into a vector and stored (`embeddings/index.js` →
   provider → `vectorStore`).
2. At query time, the question is embedded with the **same** function.
3. We compare the question vector to every chunk vector and take the closest — that's retrieval.

Same vector space for both sides is non-negotiable: you can only compare vectors produced the same
way.

## The mock provider (placeholder) in this repo

Real embedding models need an API key, so the default `mock` provider (`embeddings/mockProvider.js`)
is a **hashing vectorizer**:

- Tokenize the text (splitting camelCase and snake_case).
- Hash each token (FNV-1a) into one of `EMBEDDING_DIM` buckets and count it (term frequency).
- L2-normalise the vector (so its length is 1).

This captures **lexical** overlap — chunks sharing words get similar vectors — so retrieval really
works for keyword-style questions. It does **not** capture deep meaning (synonyms, paraphrase). That
gap is exactly what a trained model closes when you swap providers.

> Why normalise? With unit-length vectors, cosine similarity equals the dot product — cheaper to
> compute and the basis of the vector store's search.

## Dimensionality

`EMBEDDING_DIM` (default 256) is the vector length. Real models have fixed dims (e.g. 768, 1536).
Higher dims can represent more nuance but cost more memory and compute. You don't choose it freely
with a real model — it's whatever the model outputs.

## Interview Q&A

**Q: What is an embedding and why is it useful?**
A vector representation of text where distance encodes semantic similarity, enabling search by
meaning rather than exact keywords.

**Q: Why must query and documents use the same embedding model?**
Different models produce incompatible vector spaces; similarity across spaces is meaningless.

**Q: Your mock embeddings are just hashed word counts — what's the limitation?**
They capture lexical overlap, not semantics: synonyms or paraphrases that share no tokens won't be
seen as similar. A trained model maps meaning, not just words.

**Q: What does L2-normalisation buy you?**
Unit vectors make cosine similarity equal to the dot product, simplifying and speeding up search,
and removing magnitude (length) as a confounder so only direction (meaning) matters.
