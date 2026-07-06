'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import RepoInput from '../../components/RepoInput';
import Chat from '../../components/Chat';
import DiagramViewer from '../../components/DiagramViewer';
import CodeMap from '../../components/CodeMap';
import FileBrowser from '../../components/FileBrowser';
import ThemeToggle from '../../components/ThemeToggle';
import { api } from '../../lib/api';

export default function Workspace() {
  const [indexed, setIndexed] = useState(false);
  const [codebase, setCodebase] = useState(null);
  // Shared "ask" channel: panels call pushQuestion() and the Chat picks it up (click-to-ask).
  const [pending, setPending] = useState({ text: '', nonce: 0 });

  const pushQuestion = (text) => setPending((p) => ({ text, nonce: p.nonce + 1 }));

  // On load, check if a codebase is already indexed on the backend.
  useEffect(() => {
    api
      .status()
      .then((s) => {
        setIndexed(Boolean(s.indexed));
        setCodebase(s.codebase || null);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <header className="hairline-b flex items-center justify-between px-6 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="font-display text-[17px] font-semibold tracking-tight text-ink">
            Cairn
          </Link>
          <span className="label-mono">workspace</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto grid max-w-[1100px] gap-5 p-6">
        <RepoInput
          onIngested={(cb) => {
            setIndexed(true);
            setCodebase(cb || null);
          }}
        />
        <Chat
          enabled={indexed}
          pendingQuestion={pending.text}
          askNonce={pending.nonce}
          github={codebase?.github}
        />
        <DiagramViewer enabled={indexed} onAsk={pushQuestion} />
        <CodeMap enabled={indexed} />
        <FileBrowser enabled={indexed} onAsk={pushQuestion} />
      </main>
    </>
  );
}
