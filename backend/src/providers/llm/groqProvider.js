/**
 * Groq LLM provider — OpenAI-compatible chat completions at very high token throughput.
 *
 * Default model: llama-3.3-70b-versatile. Swappable via GROQ_MODEL to
 * `moonshotai/kimi-k2-instruct-0905` or `openai/gpt-oss-120b` (note: the un-suffixed
 * `kimi-k2-instruct` is deprecated — always use the -0905 build).
 *
 * Groq has no embeddings API, so the embeddings facade pairs this with Gemini/OpenAI embeddings
 * when a key is available, else the mock.
 *
 * Exposes both:
 *   complete({ system, prompt })                → { text, model }
 *   completeStream({ system, prompt, onToken }) → { text, model }  (onToken fires per delta)
 */
import { config } from '../../config.js';

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

function buildBody({ system, prompt, stream }) {
  return JSON.stringify({
    model: config.ai.groqModel,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ],
    temperature: 0.2, // low temperature for grounded, factual answers
    max_tokens: 1024,
    stream,
  });
}

function headers() {
  if (!config.ai.groqApiKey) {
    throw new Error('GROQ_API_KEY is not set. Add it to .env or switch AI_PROVIDER=mock.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.ai.groqApiKey}`,
  };
}

export async function complete({ system, prompt }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: buildBody({ system, prompt, stream: false }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content?.trim() || '';
  return { text, model: json.model || config.ai.groqModel };
}

/**
 * Streamed completion. Parses Groq's OpenAI-style SSE chunks and invokes `onToken(delta)` for
 * each text delta. Resolves with the full text once the stream ends.
 */
export async function completeStream({ system, prompt, onToken }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: buildBody({ system, prompt, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq error ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let model = config.ai.groqModel;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by double newlines; each data line is a JSON chunk or [DONE].
    const frames = buffer.split('\n\n');
    buffer = frames.pop(); // keep the trailing partial frame
    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        model = json.model || model;
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          if (onToken) onToken(delta);
        }
      } catch {
        // ignore malformed keep-alive frames
      }
    }
  }

  return { text: full.trim(), model };
}

export default { complete, completeStream, name: 'groq' };
