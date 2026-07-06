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
import geminiProvider from './geminiProvider.js';

function selectProvider() {
  switch (config.ai.provider) {
    case 'openai':    return openaiProvider;
    case 'gemini':    return geminiProvider;
    case 'anthropic':
      // Anthropic has no standalone embeddings API. Pair Claude (chat) with OpenAI embeddings
      // when a key is available — as documented in .env.example — otherwise fall back to mock.
      if (config.ai.openaiApiKey) return openaiProvider;
      logger.warn('AI_PROVIDER=anthropic without OPENAI_API_KEY — falling back to mock embeddings.');
      return mockProvider;
    case 'groq':
      // Groq has no embeddings API either. Prefer Gemini, then OpenAI, else mock — so a single
      // GROQ_API_KEY still gives real streamed answers over (lexical) mock retrieval.
      if (config.ai.geminiApiKey) return geminiProvider;
      if (config.ai.openaiApiKey) return openaiProvider;
      logger.warn('AI_PROVIDER=groq without GEMINI/OPENAI key — falling back to mock embeddings.');
      return mockProvider;
    case 'mock':
    default:
      return mockProvider;
  }
}

const provider = selectProvider();
logger.info(`Embeddings provider: ${provider.name} (dim=${provider.dim})`);

/** Facade-level batch size — small enough for per-batch progress, large enough to stay efficient. */
const PROGRESS_BATCH = 64;

/**
 * Embed an array of texts into vectors.
 * @param {string[]} texts
 * @param {(done: number, total: number) => void} [onProgress] fires after each batch — powers the
 *   SSE ingest progress bar without any provider needing to know about it.
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, onProgress) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  if (!onProgress) return provider.embed(texts);

  const vectors = [];
  for (let i = 0; i < texts.length; i += PROGRESS_BATCH) {
    const batch = texts.slice(i, i + PROGRESS_BATCH);
    vectors.push(...(await provider.embed(batch)));
    onProgress(Math.min(i + PROGRESS_BATCH, texts.length), texts.length);
  }
  return vectors;
}

/** Embed a single query string. */
export async function embedQuery(text) {
  const [v] = await provider.embed([text]);
  return v;
}

export { provider as embeddingProvider };
export default embedTexts;
