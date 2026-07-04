/**
 * LLM facade — selects the chat/completion provider from config.
 * Mirror of the embeddings facade. Callers use `complete()` and stay provider-agnostic.
 *
 * To add a real provider:
 *   1. Create ./openaiProvider.js exporting `async complete({ system, prompt, context })`.
 *   2. Add a case below.
 *   3. Set AI_PROVIDER=openai and OPENAI_API_KEY in .env.
 */
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import mockProvider from './mockProvider.js';
import openaiProvider from './openaiProvider.js';
import anthropicProvider from './anthropicProvider.js';
import geminiProvider from './geminiProvider.js';
import groqProvider from './groqProvider.js';

function selectProvider() {
  switch (config.ai.provider) {
    case 'openai':    return openaiProvider;
    case 'anthropic': return anthropicProvider;
    case 'gemini':    return geminiProvider;
    case 'groq':      return groqProvider;
    case 'mock':
    default:
      return mockProvider;
  }
}

const provider = selectProvider();
logger.info(`LLM provider: ${provider.name}`);

export async function complete(args) {
  return provider.complete(args);
}

/**
 * Streamed completion. Uses the provider's native token stream when it has one; otherwise falls
 * back to a single complete() call and replays the answer in small slices so callers (and the UI)
 * get one code path for every provider — including mock.
 */
export async function completeStream({ onToken, ...args }) {
  if (typeof provider.completeStream === 'function') {
    return provider.completeStream({ ...args, onToken });
  }
  const result = await provider.complete(args);
  if (onToken && result.text) {
    // Replay in word-ish slices so the fallback still *feels* streamed.
    for (const piece of result.text.match(/\S+\s*/g) || []) onToken(piece);
  }
  return result;
}

export { provider as llmProvider };
export default complete;
