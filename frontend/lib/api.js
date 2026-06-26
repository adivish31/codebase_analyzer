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
};

export default api;
