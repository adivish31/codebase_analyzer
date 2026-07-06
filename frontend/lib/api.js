// API client — thin wrapper around fetch for the Express backend.
// [teammate-owned] Edit freely.

const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/**
 * POST + consume a Server-Sent-Events response (EventSource can't POST, so we parse the stream
 * by hand). `handlers` maps event names → callbacks receiving the parsed JSON payload.
 * Resolves when the stream ends; rejects on transport errors or an `error` event.
 */
async function sse(path, body, handlers) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let streamError = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const frames = buf.split('\n\n');
    buf = frames.pop(); // trailing partial frame
    for (const frame of frames) {
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      if (event === 'error') streamError = new Error(payload.error || 'Stream failed');
      handlers[event]?.(payload);
    }
  }

  if (streamError) throw streamError;
}

export const api = {
  status: () => request('/api/status'),
  health: () => request('/api/health'),
  ingest: (source) =>
    request('/api/ingest', { method: 'POST', body: JSON.stringify({ source }) }),
  ask: (question, topK) =>
    request('/api/ask', { method: 'POST', body: JSON.stringify({ question, topK }) }),
  diagram: (type = 'architecture', relPath) => {
    const q = new URLSearchParams({ type, ...(relPath ? { relPath } : {}) });
    return request(`/api/diagram?${q.toString()}`);
  },
  files: () => request('/api/files'),
  // Streaming variants (SSE over POST)
  ingestStream: (source, handlers) => sse('/api/ingest/stream', { source }, handlers),
  askStream: (question, handlers, topK) => sse('/api/ask/stream', { question, topK }, handlers),
  // CodeGraph + RepoWiki
  graph: (limit) => request(`/api/graph${limit ? `?limit=${limit}` : ''}`),
  symbols: (name, exact = false) =>
    request(`/api/symbols?name=${encodeURIComponent(name)}${exact ? '&exact=true' : ''}`),
  fileDetail: (relPath) => request(`/api/file?relPath=${encodeURIComponent(relPath)}`),
  wiki: () => request('/api/wiki'),
  wikiFile: (relPath) => request(`/api/wiki/file?relPath=${encodeURIComponent(relPath)}`),
};

export default api;
