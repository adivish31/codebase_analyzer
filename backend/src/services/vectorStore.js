/**
 * In-memory vector store with brute-force cosine-similarity search.
 *
 * A vector store holds (id, vector, metadata) records and answers "give me the K records whose
 * vectors are most similar to this query vector". Because our embeddings are L2-normalised, cosine
 * similarity reduces to a dot product.
 *
 * Brute force is O(n·d) per query — perfectly fine for thousands of chunks. For millions you'd use
 * an approximate-nearest-neighbour index (HNSW / FAISS / a managed vector DB). That trade-off is
 * discussed in docs/concepts/03-vector-search.md.
 */
export class VectorStore {
  constructor() {
    /** @type {Array<{id, vector, metadata}>} */
    this.records = [];
  }

  /** Add one record: { id, vector, metadata }. */
  add(record) {
    this.records.push(record);
  }

  /** Number of indexed vectors. */
  get size() {
    return this.records.length;
  }

  /**
   * Return the top-K most similar records to `queryVector`.
   * @returns {Array<{id, score, metadata}>} sorted by descending similarity
   */
  search(queryVector, k = 5) {
    if (this.records.length === 0) return [];

    const scored = this.records.map((rec) => ({
      id: rec.id,
      score: dot(queryVector, rec.vector),
      metadata: rec.metadata,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

/** Dot product of two equal-length numeric arrays. */
export function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

/** Cosine similarity (kept separate for clarity / reuse with non-normalised vectors). */
export function cosineSimilarity(a, b) {
  let dotp = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dotp += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dotp / denom;
}

export default VectorStore;
