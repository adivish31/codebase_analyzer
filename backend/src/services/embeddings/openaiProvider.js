/**
 * OpenAI embeddings provider.
 *
 * Uses the `text-embedding-3-small` model (1536-dim). Batches requests to stay within
 * OpenAI's per-request token limit. Set AI_PROVIDER=openai and OPENAI_API_KEY in .env.
 *
 * Interface contract (same as mockProvider):
 *   embed(texts: string[]): Promise<number[][]>
 */
import { config } from '../../config.js';
import { logger } from '../../logger.js';

const MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100; // OpenAI allows up to 2048 inputs per request; keep batches sensible
const API_URL = 'https://api.openai.com/v1/embeddings';

async function callOpenAI(inputs) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.openaiApiKey}`,
    },
    body: JSON.stringify({ model: MODEL, input: inputs }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI embeddings error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const json = await res.json();
  // Response: { data: [{ embedding: number[], index: number }, ...] }
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embed(texts) {
  if (!config.ai.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env or switch AI_PROVIDER=mock.');
  }

  const results = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.info(`OpenAI embeddings: batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} texts)`);
    const vecs = await callOpenAI(batch);
    results.push(...vecs);
  }
  return results;
}

export default { embed, name: 'openai', dim: 1536 };
