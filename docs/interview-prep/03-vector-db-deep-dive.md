# 03 — Vector Databases & Search Algorithms Deep Dive

---

## Why a vector database at all?

Traditional databases search by exact match or range (B-tree indexes). They can't efficiently
answer "find me the 5 vectors most similar to this query vector" across millions of records.

A vector DB is optimised for *nearest-neighbour* search in high-dimensional space. It pairs:
- **Storage** of float vectors + metadata
- **An ANN index** for sub-linear retrieval
- **Metadata filtering** ("only search project X")
- **CRUD operations** (upsert, delete by ID or filter)

---

## The math: what "similarity" means

### Cosine similarity

```
cos(θ) = (A · B) / (‖A‖ × ‖B‖)
```

- Range: [−1, 1]. +1 = same direction, 0 = orthogonal, −1 = opposite.
- For L2-normalised vectors: `cos(θ) = A · B` (just the dot product — O(d) not O(2d)).
- **Used in this project** (and by most text/code embedding models).

### Euclidean distance (L2)

```
d(A, B) = √(Σ(Aᵢ - Bᵢ)²)
```

- Includes magnitude. Good for image/audio embeddings where absolute scale matters.
- Higher distance = less similar (opposite of cosine).

### Dot product

```
A · B = Σ Aᵢ × Bᵢ
```

- Fast. Used when embeddings aren't normalised and magnitude is a meaningful signal (e.g. OpenAI
  recommends dot product for their unnormalised text-embedding-3-* vectors, though normalising
  and using cosine works equally well).

### Why we L2-normalise before storing

```javascript
// vectorStore.js / mockProvider.js pattern
let norm = 0;
for (const v of vec) norm += v * v;
norm = Math.sqrt(norm) || 1;
for (let i = 0; i < DIM; i++) vec[i] /= norm;

// Now: ‖vec‖ = 1, so cosine = dot product
```

---

## Brute-force search (what this project uses)

```javascript
// vectorStore.js
search(queryVector, k = 5) {
  const scored = this.records.map((rec) => ({
    id: rec.id,
    score: dot(queryVector, rec.vector),   // O(d) per record
    metadata: rec.metadata,
  }));
  scored.sort((a, b) => b.score - a.score); // O(n log n)
  return scored.slice(0, k);
}
```

**Complexity:** O(n × d) per query.
- n = number of vectors, d = dimension (1536 for OpenAI)
- 10k vectors × 1536 dims = 15.36M multiplications per query
- In practice: < 5ms in JavaScript for 10k vectors

**When it breaks:** above ~100k vectors at real-time latency requirements.

---

## Approximate Nearest Neighbour (ANN) algorithms

The core insight: we don't always need *exact* top-K. A slightly different ordering is fine if it's
10–100× faster. ANN algorithms make this trade-off explicitly.

### HNSW (Hierarchical Navigable Small Worlds)

The most widely used ANN algorithm. Graph-based.

**Intuition:** build a multi-layer graph where:
- Layer 0: all nodes, many short-range edges
- Higher layers: fewer nodes, longer-range edges (highway graph)
- Query: start at top layer, greedily navigate to the query, descend through layers

```
Layer 2:  A ─────────────── B         (long-range connections)
Layer 1:  A ── C ── D ── B            (medium-range)
Layer 0:  A─B─C─D─E─F─G─H─I─B        (all nodes, local neighbourhood)
           ↑ query starts here
```

**Parameters:**
- `M` (edges per node): higher M → better recall, more memory
- `ef_construction` (search width during build): higher → slower build, better index quality
- `ef` (search width at query time): higher → better recall, slower query

**Complexity:** O(log n) per query. Recall ~95–99%.
**Used by:** Qdrant, pgvector (since 0.5), Milvus, Weaviate.

### IVF (Inverted File Index)

Partition the vector space into `nlist` Voronoi cells (via k-means clustering). At query time,
search only the `nprobe` nearest cells.

```
Training:  k-means(all_vectors, k=nlist) → centroids
Query:     find nearest nprobe centroids → search only those cells' vectors
```

**Parameters:**
- `nlist`: number of partitions (rule of thumb: √n)
- `nprobe`: how many cells to probe (higher = better recall, slower)

**IVF-Flat:** exact search within each cell.
**IVF-PQ (Product Quantization):** compress vectors into short codes → 8-16× memory reduction,
slightly worse recall. Used when RAM is a constraint.

**Complexity:** O(nprobe × n/nlist × d) per query. Much faster than brute-force with good nprobe.
**Used by:** FAISS (IVF-Flat, IVF-PQ, IVF-HNSW), pgvector (IVFFlat).

### LSH (Locality Sensitive Hashing)

Hash vectors such that similar vectors collide (map to the same bucket) with high probability.
Hash the query → look up its bucket → compare only that bucket's vectors.

**Pros:** very fast. **Cons:** lower recall than HNSW, sensitive to hyperparameter tuning.
Mostly replaced by HNSW in practice for general use.

---

## Production vector database options

| DB | Type | Index | Strength | Weakness |
|----|------|-------|----------|---------|
| **pgvector** | Extension (Postgres) | HNSW, IVFFlat | Already on Postgres, SQL joins, free | Less specialised, slower at >10M vectors |
| **Qdrant** | Purpose-built (Rust) | HNSW | Fast, great metadata filtering, open-source | Not as mature as Pinecone |
| **Pinecone** | Managed SaaS | Proprietary | Zero-ops, scales automatically | Cost at scale, vendor lock-in |
| **Weaviate** | Purpose-built | HNSW | Hybrid search (BM25 + vector) built-in | Heavier to self-host |
| **Milvus** | Purpose-built | HNSW, IVF-PQ | Largest scale, GPU support | Complex to operate |
| **FAISS** | Library (C++/Python) | IVF, HNSW | Extremely fast, Facebook-grade | Not a DB; manual persistence, Python/C++ |
| **Chroma** | Embedded / managed | HNSW | Easy Python integration | Not production-hardened |

### When to use which

- **Prototype / small scale (<100k vectors):** in-memory brute-force (this project) or Chroma
- **Already on Postgres:** add pgvector, use HNSW index
- **Need managed, no ops:** Pinecone or Qdrant Cloud
- **Need hybrid (keyword + vector):** Weaviate
- **Massive scale (billions of vectors):** Milvus with GPU indexing or Pinecone

---

## Metadata filtering

Most vector DBs support pre-filtering or post-filtering by metadata fields.

**Post-filtering:** retrieve top-K globally, then filter. Risk: after filtering, you have < K results.

**Pre-filtering:** only search the subset matching the filter. Better, but needs the index to
support it. HNSW doesn't support pre-filtering natively; Qdrant and Pinecone do with special
index structures.

In this project: the metadata includes `relPath` and `language` — you could add a filter like
`{ language: 'javascript' }` when asking a JS-specific question.

---

## How pgvector works (practical)

```sql
-- 1. Enable
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Table with a vector column
CREATE TABLE chunks (
  id        TEXT PRIMARY KEY,
  rel_path  TEXT,
  language  TEXT,
  start_line INT,
  end_line   INT,
  content   TEXT,
  embedding vector(1536)   -- dimension matches your model
);

-- 3. HNSW index (recommended for low-latency queries)
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. Insert
INSERT INTO chunks VALUES ($1, $2, $3, $4, $5, $6, $7::vector);

-- 5. Search (returns top-5 most similar)
SELECT id, rel_path, start_line, end_line,
       1 - (embedding <=> $1::vector) AS score
FROM chunks
WHERE language = 'javascript'   -- metadata pre-filter
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

`<=>` = cosine distance. `<->` = L2 distance. `<#>` = negative dot product.

**Upgrade path from this project:** replace `VectorStore` with a pg client, replace `search()`
with the SQL above. `state.js` changes to a DB connection pool. Everything else stays the same.

---

## Interview Q&A

**Q: What is HNSW and why is it popular?**
A graph-based ANN algorithm that builds a multi-layer navigable small-world graph. Query traverses
from coarse (top layer) to fine (layer 0) in O(log n). High recall (~99%), fast queries, good
for high-dimensional data. Supported by most modern vector DBs.

**Q: What is the trade-off between HNSW and IVF?**
HNSW: better recall, higher memory (stores full graph). IVF: lower memory (especially with PQ
compression), recall depends on nprobe. HNSW is better default; IVF-PQ when memory is tight.

**Q: How do you handle updates (new files committed)?**
Delete-then-reinsert: delete all chunks with `rel_path = 'changed_file.js'`, re-chunk and
re-embed the new version, upsert the new chunks. Most vector DBs support deletion by metadata filter.

**Q: What is "recall@5" and how would you improve it?**
The fraction of queries where at least one truly relevant chunk is in the top-5 results. Improve
by: better embedding model, syntax-aware chunking (more coherent units), re-ranking (cross-encoder),
or hybrid search (BM25 + vector, merged with RRF).

**Q: What is RRF (Reciprocal Rank Fusion)?**
A way to merge ranked lists from different retrieval methods (e.g. BM25 and vector search):
```
RRF_score(chunk, k=60) = Σ 1 / (k + rank_in_list_i)
```
Simple, no training needed, works well in practice. Used by Weaviate and OpenSearch hybrid search.

**Q: How many vectors can you hold in RAM?**
1536-dim float32 = 6144 bytes (~6 KB) per vector.
- 10k vectors = 60 MB
- 100k vectors = 600 MB
- 1M vectors = ~6 GB
At 1M+ vectors, use IVF-PQ compression or a disk-based index (DiskANN).
