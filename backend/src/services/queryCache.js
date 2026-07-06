/**
 * In-process LRU cache for /api/ask answers.
 *
 * Why not Redis: this app is single-instance by design (state.js), so a Map gives the same demo
 * win — repeat questions answer in ~1ms and cost zero LLM tokens — with no infra to run. The key
 * includes the index's `ingestedAt`, so re-ingesting invalidates every stale entry implicitly.
 */
const MAX_ENTRIES = 200;

const cache = new Map(); // insertion-ordered — oldest first, which is all an LRU needs

function keyOf(question, topK, indexVersion) {
  return `${indexVersion}::${topK}::${question.trim().toLowerCase()}`;
}

export function getCached(question, topK, indexVersion) {
  const key = keyOf(question, topK, indexVersion);
  const hit = cache.get(key);
  if (!hit) return null;
  // refresh recency
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setCached(question, topK, indexVersion, answer) {
  const key = keyOf(question, topK, indexVersion);
  cache.set(key, answer);
  if (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value); // evict least-recently used
  }
}

/** For /api/health and tests. */
export function cacheStats() {
  return { entries: cache.size, max: MAX_ENTRIES };
}

export function clearCache() {
  cache.clear();
}
