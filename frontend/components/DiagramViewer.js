'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { renderMermaid, downloadSvgAsPng } from '../lib/renderMermaid';

const TYPES = [
  { key: 'architecture', label: 'Architecture' },
  { key: 'dependency', label: 'Dependencies' },
];

// Fetches Mermaid source from the backend and renders it (mermaid.js is loaded dynamically,
// client-side only, via the shared renderMermaid helper).
// Enhancements: click a node to auto-ask about it (onAsk), and export the diagram as a PNG.
export default function DiagramViewer({ enabled, onAsk }) {
  const [type, setType] = useState('architecture');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  async function render() {
    if (!enabled) return;
    setError('');
    setLoading(true);
    try {
      const { mermaid: source } = await api.diagram(type);
      svgRef.current = await renderMermaid(containerRef.current, source);
    } catch (e) {
      setError(e.message);
      if (containerRef.current) containerRef.current.innerHTML = '';
      svgRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (enabled) render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, enabled]);

  // Click-to-ask: clicking a diagram node sends "Explain the <label> module" up to the chat.
  function handleClick(e) {
    if (!onAsk) return;
    const node = e.target.closest('.node');
    if (!node || !containerRef.current?.contains(node)) return;
    const raw = (node.textContent || '').trim();
    // Architecture nodes look like "backend12 file(s)" — strip the file count.
    const label = raw.replace(/\s*\d+\s*file\(s\).*$/i, '').trim();
    if (label) onAsk(`Explain the ${label} module`);
  }

  async function exportPng() {
    try {
      await downloadSvgAsPng(svgRef.current, `${type}-diagram.png`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="panel">
      <h2>3 · Visualize the flow</h2>
      {!enabled && <p className="muted">Ingest a codebase first.</p>}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
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
        <button className="ghost-btn" onClick={exportPng} disabled={!enabled || loading || !svgRef.current}>
          Export PNG
        </button>
      </div>
      {enabled && onAsk && <p className="muted">Tip: click a node to ask about it.</p>}
      {loading && <div className="skeleton skeleton-diagram" />}
      {error && <p className="error">{error}</p>}
      <div
        className="diagram"
        ref={containerRef}
        onClick={handleClick}
        style={{ display: loading ? 'none' : 'block' }}
      />
    </section>
  );
}
