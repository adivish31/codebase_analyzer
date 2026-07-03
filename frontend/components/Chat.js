'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import CopyButton from './CopyButton';
import CodeBlock from './CodeBlock';

// Q&A over the ingested codebase. Each AI answer shows the source chunks it used (with an
// expandable, syntax-highlighted preview and a copy button on the answer).
// `pendingQuestion` + `askNonce` let other panels (diagram / file browser) push a question here.
export default function Chat({ enabled, pendingQuestion, askNonce }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openSource, setOpenSource] = useState({}); // "msgIdx:srcIdx" -> bool
  const threadRef = useRef(null);

  async function ask(text) {
    const q = (text ?? question).trim();
    if (!q || loading) return;
    setError('');
    setLoading(true);
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setQuestion('');
    try {
      const res = await api.ask(q);
      setMessages((m) => [...m, { role: 'ai', text: res.answer, sources: res.sources }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-ask when another panel pushes a question (click-to-ask). Guard on askNonce so it only
  // fires on a fresh push, never on mount or re-render.
  useEffect(() => {
    if (askNonce && pendingQuestion && enabled) ask(pendingQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askNonce]);

  // Keep the newest message in view.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const toggleSource = (key) => setOpenSource((s) => ({ ...s, [key]: !s[key] }));

  return (
    <section className="panel">
      <h2>2 · Ask about the code</h2>
      {!enabled && <p className="muted">Ingest a codebase first.</p>}

      <div className="thread" ref={threadRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'ai' && (
              <div className="msg-toolbar">
                <CopyButton text={m.text} label="Copy answer" />
              </div>
            )}
            <pre>{m.text}</pre>
            {m.sources?.length > 0 && (
              <div className="sources">
                {m.sources.map((s, j) => {
                  const key = `${i}:${j}`;
                  const open = openSource[key];
                  return (
                    <div key={j} className="source">
                      <button className="source-head" onClick={() => toggleSource(key)}>
                        <span className="source-caret">{open ? '▾' : '▸'}</span>
                        {s.relPath}:{s.startLine}-{s.endLine} · score {s.score}
                      </button>
                      {open && s.preview && (
                        <CodeBlock code={s.preview} language={s.language} title={`${s.relPath} (${s.language})`} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="msg ai">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line" />
          </div>
        )}
      </div>

      <div className="row">
        <input
          placeholder="How does authentication work? What calls processPayment?"
          value={question}
          disabled={!enabled || loading}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
        />
        <button onClick={() => ask()} disabled={!enabled || loading || !question}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
