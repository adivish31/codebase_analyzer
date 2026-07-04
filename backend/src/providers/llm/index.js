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

function selectProvider() {
  switch (config.ai.provider) {
    case 'openai':    return openaiProvider;
    case 'anthropic': return anthropicProvider;
    case 'gemini':    return geminiProvider;
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

export { provider as llmProvider };
export default complete;
