# 03 — Vector stores & nearest-neighbour search

## What a vector store does

A vector store holds records of `(id, vector, metadata)` and answers one question well: *"given this
query vector, which stored vectors are most similar?"* That's **nearest-neighbour search**.

In this project: `services/vectorStore.js`, a `VectorStore` class wrapping an array.

## Measuring similarity: cosine

We use **cosine similarity** — the cosine of the angle between two vectors. It ignores magnitude and
measures direction, which is what we want for meaning.

```
cosine(a, b) = (a · b) / (||a|| · ||b||)
```

Because our embeddings are L2-normalised (length 1), the denominator is 1, so:

```
cosine(a, b) = a · b   (just the dot product)
```

That's why `search()` calls `dot()` directly — it's the fast path enabled by normalisation. The file
also keeps a general `cosineSimilarity()` for non-normalised vectors.

## The search algorithm here (brute force / exact KNN)

```
for each stored record:
    score = dot(queryVector, record.vector)
sort by score descending
return top K
```

Complexity: **O(n · d)** per query (n = number of chunks, d = dimensions), plus the sort. For
thousands of chunks this is milliseconds — exact and simple.

## Why this doesn't scale, and what replaces it

At millions of vectors, scanning everything per query is too slow. Production systems use
**Approximate Nearest Neighbour (ANN)** indexes that trade a little accuracy for sub-linear search:

- **HNSW** (hierarchical navigable small world graphs) — the common default; great recall/speed.
- **IVF / product quantization** (FAISS) — cluster then search within clusters; compresses vectors.
- **Managed vector DBs** — pgvector, Pinecone, Qdrant, Weaviate, Milvus — add persistence,
  filtering, and scaling on top.

Our in-memory exact search is the honest baseline; the upgrade is "swap the store, keep the
interface."

## Distance metrics (know the menu)

- **Cosine** — direction/meaning (what we use).
- **Dot product** — cosine for normalised vectors; also used directly when magnitude matters.
- **Euclidean (L2)** — straight-line distance; common with some models.

## Interview Q&A

**Q: Cosine vs Euclidean — when does it matter?**
For normalised embeddings they rank results almost identically. Cosine ignores magnitude, which is
usually desirable for text. Pick what the embedding model was trained/optimized for.

**Q: Why is dot product enough in your code?**
Vectors are L2-normalised, so the cosine denominator is 1 and cosine reduces to the dot product.

**Q: Your search is O(n·d). How do you scale to millions of vectors?**
Switch from exact brute force to an ANN index (HNSW/FAISS) or a managed vector DB; accept a small
recall hit for sub-linear query time, and add persistence.

**Q: What is "top-K" and how do you choose K?**
The K nearest chunks returned. Tune empirically: too small misses context, too large adds noise and
cost. We default to 5.
