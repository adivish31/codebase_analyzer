/**
 * Mock embeddings provider (placeholder).
 *
 * Produces deterministic, dependency-free vectors so the whole RAG pipeline runs end-to-end with NO
 * API key. It is a "hashing vectorizer": each token is hashed into a bucket of a fixed-dimension
 * vector (term-frequency style), then the vector is L2-normalised.
 *
 * This captures real lexical overlap — chunks that share words get similar vectors — so retrieval
 * genuinely works for keyword-ish questions. It does NOT capture deep semantic meaning the way a
 * trained model does; that's exactly what you gain when you swap in a real provider later.
 *
 * Replace by setting AI_PROVIDER=openai|anthropic and implementing the matching provider file.
 */
import { config } from '../../config.js';

const DIM = config.embedding.dim;

/** Fast deterministic string hash (FNV-1a, 32-bit). */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Split text into lowercase word/identifier tokens (handles camelCase + snake_case). */
function tokenize(text) {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1);
}

/** Embed a single string into a normalised Float array of length DIM. */
export function embedOne(text) {
  const vec = new Array(DIM).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const bucket = hash(tok) % DIM;
    vec[bucket] += 1;
  }
  // L2 normalise so cosine similarity == dot product.
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return vec;
}

/** Embed many strings. Async to match the real-provider interface. */
export async function embed(texts) {
  return texts.map(embedOne);
}

export default { embed, embedOne, dim: DIM, name: 'mock' };
