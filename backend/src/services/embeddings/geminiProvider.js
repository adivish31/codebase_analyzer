/**
 * Google Gemini embeddings provider (gemini-embedding-001, truncated to 768 dims).
 *
 * Uses the batchEmbedContents endpoint. IMPORTANT: at truncated output dimensions the API returns
 * UN-normalised vectors (only the full 3072-dim output is unit length), so we L2-normalise
 * client-side — the vector store's dot-product search assumes unit vectors.
 *
 * Interface contract (same as mockProvider):
 *   embed(texts: string[]): Promise<number[][]>
 */
import { config } from '../../config.js';
import { logger } from '../../logger.js';

const MODEL = 'gemini-embedding-001';
const DIM = 768; // good quality/size trade-off; smaller vectors keep the DB + memory light
// The API allows 100 requests per batch call, but the free tier caps tokens-per-minute; smaller
// batches + retry/backoff (below) keep large ingests flowing instead of failing on 429.
const BATCH_SIZE = 25;
const MAX_RETRIES = 5;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pull the API-suggested retry delay (RetryInfo) out of a 429 error body, if present. */
function suggestedDelayMs(errBody) {
  const info = errBody?.error?.details?.find((d) => (d['@type'] || '').includes('RetryInfo'));
  const m = /^(\d+(?:\.\d+)?)s$/.exec(info?.retryDelay || '');
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

/** L2-normalise a vector in place so cosine similarity == dot product. */
function normalize(vec) {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

async function callGemini(inputs) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.ai.geminiApiKey,
      },
      body: JSON.stringify({
        requests: inputs.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: DIM,
        })),
      }),
    });

    if (res.ok) {
      const json = await res.json();
      // Response: { embeddings: [{ values: number[] }, ...] } in request order
      return json.embeddings.map((e) => normalize(e.values));
    }

    const err = await res.json().catch(() => ({}));
    // Rate limits (429) and transient server errors (5xx) are retried with backoff, honouring
    // the API's suggested delay when it provides one.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`Gemini embeddings error ${res.status}: ${err?.error?.message || res.statusText}`);
    }
    const delay = suggestedDelayMs(err) ?? Math.min(2000 * 2 ** attempt, 60000);
    logger.warn(`Gemini embeddings ${res.status}; retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES}).`);
    await sleep(delay);
  }
}

export async function embed(texts) {
  if (!config.ai.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env or switch AI_PROVIDER=mock.');
  }

  const results = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.info(`Gemini embeddings: batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} texts)`);
    const vecs = await callGemini(batch);
    results.push(...vecs);
  }
  return results;
}

export default { embed, name: 'gemini', dim: DIM };
