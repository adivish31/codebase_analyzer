'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const TYPES = [
  { key: 'architecture', label: 'Architecture' },
  { key: 'dependency', label: 'Dependencies' },
];

// Fetches Mermaid source from the backend and renders it with mermaid.js (loaded dynamically,
// client-side only).
export default function DiagramViewer({ enabled }) {
  const [type, setType] = useState('architecture');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  async function render() {
    if (!enabled) return;
    setError(''); setLoading(true);
    try {
      const { mermaid: source } = await api.diagram(type);
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({ startOnLoad: false, theme: 'default' });
      const { svg } = await mermaid.render(`d-${Date.now()}`, source);
      if (containerRef.current) containerRef.current.innerHTML = svg;
    } catch (e) {
      setError(e.message);
      if (containerRef.current) containerRef.current.innerHTML = '';
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (enabled) render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, enabled]);

  return (
    <section className="panel">
      <h2>3 · Visualize the flow</h2>
      {!enabled && <p className="muted">Ingest a codebase first.</p>}
      <div className="tabs">
        {TYPES.map((t) => (
          <button
            key={t.key}
            className={type === t.key ? 'active' : ''}
            onClick={() => setType(t.key)}
            disabled={!enabled}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading && <p className="muted">Rendering…</p>}
      {error && <p className="error">{error}</p>}
      <div className="diagram" ref={containerRef} />
    </section>
  );
}
