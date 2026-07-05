/**
 * Landing-page metrics. Updated by `npm run eval` (backend/scripts/eval.js) — the numbers shown
 * on the site are the latest real scorecard, not marketing copy.
 */
export const METRICS = {
  retrievalHitRate: 80, // % of golden questions whose expected file appears in top-5 sources
  citationAccuracy: 100, // % of cited paths that exist in the indexed repo
  p50LatencyMs: 1900, // median /api/ask latency (real LLM, warm index)
  chunksIndexed: 126, // chunks in the self-indexed demo repo
};
