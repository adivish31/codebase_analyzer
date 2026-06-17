/**
 * Embeddings facade.
 *
 * The rest of the app calls `embedTexts()` and never knows which provider is behind it. Selecting a
 * provider is a one-line config change (AI_PROVIDER). This is the "strategy pattern" / dependency
 * inversion — see docs/concepts/06-llm-provider-abstraction.md.
 *
 * To add a real provider:
 *   1. Create ./openaiProvider.js exporting `async embed(texts) => number[][]`.
 *   2. Add a case below.
 *   3. Set AI_PROVIDER=openai and OPENAI_API_KEY in .env.
 */
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import mockProvider from './mockProvider.js';
import openaiProvider from './openaiProvider.js';

function selectProvider() {
  switch (config.ai.provider) {
    case 'openai':    return openaiProvider;
    // case 'anthropic': anthropic doesn't offer a standalone embeddings API;
    //                   use openai embeddings + anthropic LLM if preferred.
    case 'mock':
    default:
      return mockProvider;
  }
}

const provider = selectProvider();
logger.info(`Embeddings provider: ${provider.name} (dim=${provider.dim})`);

/**
 * Embed an array of texts into vectors.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  return provider.embed(texts);
}

/** Embed a single query string. */
export async function embedQuery(text) {
  const [v] = await provider.embed([text]);
  return v;
}

export { provider as embeddingProvider };
export default embedTexts;
