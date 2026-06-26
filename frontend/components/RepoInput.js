'use client';
import { useState } from 'react';
import { api } from '../lib/api';

// Lets the user point the tool at a repo (GitHub URL or local path) and ingest it.
export default function RepoInput({ onIngested }) {
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);

  async function ingest() {
    setError(''); setInfo(null); setLoading(true);
    try {
      const res = await api.ingest(source.trim());
      setInfo(res.codebase);
      onIngested?.(res.codebase);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>1 · Ingest a codebase</h2>
      <div className="row">
        <input
          placeholder="https://github.com/user/repo.git  or  /path/to/local/folder"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && source && ingest()}
        />
        <button onClick={ingest} disabled={!source || loading}>
          {loading ? 'Indexing…' : 'Ingest'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {info && (
        <p className="muted">
          Indexed {info.chunkCount} chunks from {info.fileCount} files — ask away below.
        </p>
      )}
    </section>
  );
}
