'use client';
import { useEffect, useState } from 'react';
import RepoInput from '../components/RepoInput';
import Chat from '../components/Chat';
import DiagramViewer from '../components/DiagramViewer';
import CodeMap from '../components/CodeMap';
import FileBrowser from '../components/FileBrowser';
import { api } from '../lib/api';

export default function Home() {
  const [indexed, setIndexed] = useState(false);
  // Shared "ask" channel: panels call pushQuestion() and the Chat picks it up (click-to-ask).
  const [pending, setPending] = useState({ text: '', nonce: 0 });

  const pushQuestion = (text) => setPending((p) => ({ text, nonce: p.nonce + 1 }));

  // On load, check if a codebase is already indexed on the backend.
  useEffect(() => {
    api.status().then((s) => setIndexed(Boolean(s.indexed))).catch(() => {});
  }, []);

  return (
    <>
      <RepoInput onIngested={() => setIndexed(true)} />
      <Chat enabled={indexed} pendingQuestion={pending.text} askNonce={pending.nonce} />
      <DiagramViewer enabled={indexed} onAsk={pushQuestion} />
      <CodeMap enabled={indexed} />
      <FileBrowser enabled={indexed} onAsk={pushQuestion} />
    </>
  );
}
