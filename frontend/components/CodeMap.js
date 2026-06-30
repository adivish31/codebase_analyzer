'use client';
import { useState } from 'react';
import { api } from '../lib/api';

// Code Map panel — demonstrates the CodeGraph DB: search where a symbol is defined
// ("Where is the payment logic?") and inspect a file's dependencies + dependents.
export default function CodeMap({ enabled }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function search() {
    const name = query.trim();
    if (!name) return;
    setError(''); setLoading(true); setDetail(null);
    try {
      const res = await api.symbols(name);
      setMatches(res.matches || []);
      if ((res.matches || []).length === 0) setError(`No symbol matching "${name}".`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function inspect(relPath) {
    setError(''); setLoading(true);
    try {
      setDetail(await api.fileDetail(relPath));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>4 · Code map — find where things are defined</h2>
      {!enabled && <p className="muted">Ingest a codebase first.</p>}

      <div className="row">
        <input
          placeholder="Symbol name, e.g. processPayment, chunkDocument, VectorStore"
          value={query}
          disabled={!enabled || loading}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button onClick={search} disabled={!enabled || loading || !query}>
          {loading ? 'Searching…' : 'Find'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {matches.length > 0 && (
        <div className="sources">
          {matches.map((m, i) => (
            <div key={i} className="source" style={{ cursor: 'pointer' }} onClick={() => inspect(m.relPath)}>
              <strong>{m.name}</strong> <em>({m.kind})</em> — {m.relPath}:{m.line}
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="msg ai" style={{ marginTop: 12 }}>
          <pre>{detail.relPath}</pre>
          {detail.wiki?.summary && <p className="muted">{detail.wiki.summary}</p>}
          <div className="sources">
            <div className="source"><strong>Depends on:</strong> {detail.dependencies.join(', ') || '—'}</div>
            <div className="source"><strong>Imported by:</strong> {detail.dependents.join(', ') || '—'}</div>
            <div className="source"><strong>Symbols:</strong> {detail.symbols.map((s) => s.name).join(', ') || '—'}</div>
          </div>
        </div>
      )}
    </section>
  );
}
