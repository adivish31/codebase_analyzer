/**
 * Anthropic Claude LLM provider (claude-haiku-4-5).
 *
 * Calls the Anthropic Messages API. Haiku is fast and cheap — ideal for RAG Q&A where
 * latency matters more than long reasoning chains. Set AI_PROVIDER=anthropic and
 * ANTHROPIC_API_KEY in .env to activate.
 *
 * Interface contract (same as mockProvider):
 *   complete({ system, prompt, context }): Promise<{ text, model }>
 */
import { config } from '../../config.js';

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export async function complete({ system, prompt }) {
  if (!config.ai.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env or switch AI_PROVIDER=mock.');
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.ai.anthropicApiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const json = await res.json();
  const text = json.content?.[0]?.text?.trim() || '';
  return { text, model: json.model || MODEL };
}

export default { complete, name: 'anthropic' };
