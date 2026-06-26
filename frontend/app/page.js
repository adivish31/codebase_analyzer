'use client';
import { useEffect, useState } from 'react';
import RepoInput from '../components/RepoInput';
import Chat from '../components/Chat';
import DiagramViewer from '../components/DiagramViewer';
import { api } from '../lib/api';

export default function Home() {
  const [indexed, setIndexed] = useState(false);

  // On load, check if a codebase is already indexed on the backend.
  useEffect(() => {
    api.status().then((s) => setIndexed(Boolean(s.indexed))).catch(() => {});
  }, []);

  return (
    <>
      <RepoInput onIngested={() => setIndexed(true)} />
      <Chat enabled={indexed} />
      <DiagramViewer enabled={indexed} />
    </>
  );
}
