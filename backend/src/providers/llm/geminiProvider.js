/**
 * Google Gemini LLM provider (gemini-2.5-flash).
 *
 * Calls the Gemini API's generateContent endpoint. Flash is fast and inexpensive — a good fit for
 * RAG Q&A. Thinking is disabled (thinkingBudget: 0) so the token budget goes to the answer, not
 * hidden reasoning. Set AI_PROVIDER=gemini and GEMINI_API_KEY in .env to activate.
 *
 * Interface contract (same as mockProvider):
 *   complete({ system, prompt, context }): Promise<{ text, model }>
 */
import { config } from '../../config.js';
import { logger } from '../../logger.js';

const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pull the API-suggested retry delay (RetryInfo) out of a 429 error body, if present. */
function suggestedDelayMs(errBody) {
  const info = errBody?.error?.details?.find((d) => (d['@type'] || '').includes('RetryInfo'));
  const m = /^(\d+(?:\.\d+)?)s$/.exec(info?.retryDelay || '');
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

export async function complete({ system, prompt }) {
  if (!config.ai.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env or switch AI_PROVIDER=mock.');
  }

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.ai.geminiApiKey,
      },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, // low temperature for grounded, factual answers
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (res.ok) {
      const json = await res.json();
      const parts = json.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p.text || '').join('').trim();
      return { text, model: json.modelVersion || MODEL };
    }

    const err = await res.json().catch(() => ({}));
    // Retry rate limits (429) and transient server errors (5xx) with backoff.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`Gemini error ${res.status}: ${err?.error?.message || res.statusText}`);
    }
    const delay = suggestedDelayMs(err) ?? Math.min(2000 * 2 ** attempt, 30000);
    logger.warn(`Gemini chat ${res.status}; retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES}).`);
    await sleep(delay);
  }
}

export default { complete, name: 'gemini' };
