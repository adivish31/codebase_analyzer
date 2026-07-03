'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { renderMermaid, downloadSvgAsPng } from '../lib/renderMermaid';

// File browser — lists every indexed file (GET /api/files). Clicking a file renders its "module"
// diagram (symbols declared in that file) inline via GET /api/diagram?type=module. Optionally hands
// a ready-made question up to the chat via `onAsk`.
export default function FileBrowser({ enabled, onAsk }) {
  const [files, setFiles] = useState([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  // Load the file list whenever a codebase becomes available.
  useEffect(() => {
    if (!enabled) {
      setFiles([]);
      setSelected('');
      return;
    }
    api
      .files()
      .then((res) => setFiles(res.files || []))
      .catch((e) => setError(e.message));
  }, [enabled]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? files.filter((f) => f.relPath.toLowerCase().includes(q)) : files;
    return list.slice(0, 500);
  }, [files, filter]);

  async function select(relPath) {
    setSelected(relPath);
    setError('');
    setLoading(true);
    try {
      const { mermaid: source } = await api.diagram('module', relPath);
      svgRef.current = await renderMermaid(containerRef.current, source);
    } catch (e) {
      setError(e.message);
      if (containerRef.current) containerRef.current.innerHTML = '';
      svgRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  async function exportPng() {
    try {
      await downloadSvgAsPng(svgRef.current, `${(selected || 'module').replace(/[\\/]/g, '_')}.png`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="panel">
      <h2>5 · File browser</h2>
      {!enabled && <p className="muted">Ingest a codebase first.</p>}

      {enabled && (
        <div className="filebrowser">
          <div className="filebrowser-list">
            <input
              className="filebrowser-filter"
              placeholder={`Filter ${files.length} files…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="filebrowser-scroll">
              {shown.map((f) => (
                <button
                  key={f.relPath}
                  className={`filebrowser-item ${selected === f.relPath ? 'active' : ''}`}
                  onClick={() => select(f.relPath)}
                  title={f.relPath}
                >
                  <span className="filebrowser-path">{f.relPath}</span>
                  <span className="filebrowser-meta">{f.language} · {f.chunkCount}</span>
                </button>
              ))}
              {shown.length === 0 && <p className="muted">No files match “{filter}”.</p>}
            </div>
          </div>

          <div className="filebrowser-detail">
            {!selected && <p className="muted">Select a file to see its module diagram.</p>}
            {selected && (
              <>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong className="filebrowser-selected">{selected}</strong>
                  <div className="row" style={{ gap: 6 }}>
                    {onAsk && (
                      <button className="ghost-btn" onClick={() => onAsk(`Explain the file ${selected}`)}>
                        Ask about this file
                      </button>
                    )}
                    <button className="ghost-btn" onClick={exportPng} disabled={loading || !svgRef.current}>
                      Export PNG
                    </button>
                  </div>
                </div>
                {loading && <div className="skeleton skeleton-diagram" />}
                {error && <p className="error">{error}</p>}
                <div className="diagram" ref={containerRef} style={{ display: loading ? 'none' : 'block' }} />
              </>
            )}
          </div>
        </div>
      )}
      {!selected && error && <p className="error">{error}</p>}
    </section>
  );
}
