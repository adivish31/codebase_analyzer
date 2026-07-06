'use client';
import { useState } from 'react';
import { api } from '../lib/api';

const STAGE_LABELS = {
  cloning: 'cloning',
  parsing: 'parsing',
  graphing: 'building graph',
  chunking: 'chunking',
  embedding: 'embedding',
  storing: 'persisting',
  wiki: 'writing wiki',
  done: 'done',
};

// Point the tool at a repo (GitHub URL or local path). Ingestion streams real pipeline
// progress over SSE — stage label + 0–100% — instead of an indeterminate spinner.
export default function RepoInput({ onIngested }) {
  const [source, setSource] = useState('');
  const [progress, setProgress] = useState(null); // { stage, percent, detail } | null
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);

  const loading = progress !== null && progress.stage !== 'done';

  async function ingest() {
    setError('');
    setInfo(null);
    setProgress({ stage: 'cloning', percent: 0 });
    try {
      await api.ingestStream(source.trim(), {
        stage: (p) => setProgress(p),
        done: ({ codebase }) => {
          setProgress({ stage: 'done', percent: 100 });
          setInfo(codebase);
          onIngested?.(codebase);
        },
      });
    } catch (e) {
      setError(e.message);
      setProgress(null);
    }
  }

  return (
    <section className="panel">
      <h2>1 · Ingest a codebase</h2>
      <div className="row">
        <input
          placeholder="https://github.com/user/repo.git  or  /path/to/local/folder"
          value={source}
          disabled={loading}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && source && !loading && ingest()}
        />
        <button onClick={ingest} disabled={!source || loading}>
          {loading ? `${progress.percent}%` : 'Ingest'}
        </button>
      </div>

      {loading && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: 'var(--border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress.percent}%`,
                background: 'var(--accent)',
                transition: 'width 300ms ease',
              }}
            />
          </div>
          <p className="label-mono" style={{ marginTop: 8 }}>
            {STAGE_LABELS[progress.stage] || progress.stage}
            {progress.detail ? ` — ${progress.detail}` : ''}
          </p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {info && (
        <p className="muted">
          Indexed {info.chunkCount} chunks · {info.symbolCount} symbols · {info.edgeCount} import
          edges from {info.fileCount} files in {(info.durationMs / 1000).toFixed(1)}s — ask away
          below.
        </p>
      )}
    </section>
  );
}
