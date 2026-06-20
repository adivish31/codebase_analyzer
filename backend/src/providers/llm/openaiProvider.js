/**
 * OpenAI LLM provider (gpt-4o-mini).
 *
 * Sends the assembled RAG prompt to the OpenAI chat completions endpoint.
 * Set AI_PROVIDER=openai and OPENAI_API_KEY in .env to activate.
 *
 * Interface contract (same as mockProvider):
 *   complete({ system, prompt, context }): Promise<{ text, model }>
 */
import { config } from '../../config.js';

const MODEL = 'gpt-4o-mini';
const API_URL = 'https://api.openai.com/v1/chat/completions';

export async function complete({ system, prompt }) {
  if (!config.ai.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env or switch AI_PROVIDER=mock.');
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: 0.2, // low temperature for grounded, factual answers
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI chat error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() || '';
  return { text, model: json.model || MODEL };
}

export default { complete, name: 'openai' };
