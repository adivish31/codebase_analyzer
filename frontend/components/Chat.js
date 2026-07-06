'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import CopyButton from './CopyButton';
import CodeBlock from './CodeBlock';

/** Deep link to the exact lines on GitHub, pinned to the indexed commit. */
function githubUrl(github, s) {
  if (!github?.owner || !github?.sha) return null;
  return `https://github.com/${github.owner}/${github.repo}/blob/${github.sha}/${s.relPath}#L${s.startLine}-L${s.endLine}`;
}

// Q&A over the ingested codebase. Answers stream token-by-token over SSE; citations arrive
// BEFORE the first token and render as chips that deep-link to GitHub at the indexed commit.
// `pendingQuestion` + `askNonce` let other panels (diagram / file browser) push a question here.
export default function Chat({ enabled, pendingQuestion, askNonce, github }) {
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

    // Placeholder AI message that the stream fills in.
    setMessages((m) => [...m, { role: 'ai', text: '', sources: [], streaming: true }]);
    const patchLast = (patch) =>
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { ...next[next.length - 1], ...patch };
        return next;
      });

    try {
      let acc = '';
      await api.askStream(q, {
        sources: ({ sources }) => patchLast({ sources }),
        token: ({ delta }) => {
          acc += delta;
          patchLast({ text: acc });
        },
        done: (result) =>
          patchLast({
            text: result.answer,
            sources: result.sources,
            model: result.model,
            cached: result.cached,
            streaming: false,
          }),
      });
    } catch (e) {
      setError(e.message);
      // Drop the empty placeholder if nothing streamed.
      setMessages((m) => (m[m.length - 1]?.streaming && !m[m.length - 1].text ? m.slice(0, -1) : m));
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
            {m.role === 'ai' && !m.streaming && m.text && (
              <div className="msg-toolbar">
                {m.cached && <span className="label-mono" style={{ marginRight: 8 }}>cached</span>}
                <CopyButton text={m.text} label="Copy answer" />
              </div>
            )}
            <pre>
              {m.text}
              {m.streaming && <span style={{ color: 'var(--accent)' }}>▌</span>}
            </pre>
            {m.sources?.length > 0 && (
              <div className="sources">
                {m.sources.map((s, j) => {
                  const key = `${i}:${j}`;
                  const open = openSource[key];
                  const href = githubUrl(github, s);
                  return (
                    <div key={j} className="source">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="source-head" onClick={() => toggleSource(key)}>
                          <span className="source-caret">{open ? '▾' : '▸'}</span>
                          {s.relPath}:{s.startLine}-{s.endLine}
                          {typeof s.score === 'number' ? ` · score ${s.score}` : ''}
                        </button>
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            title="Open these lines on GitHub (at the indexed commit)"
                            style={{ color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}
                          >
                            ↗
                          </a>
                        )}
                      </div>
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

        {loading && messages[messages.length - 1]?.text === '' && (
          <div className="msg ai" aria-hidden="true">
            <div className="skeleton" style={{ height: 12, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 12, width: '60%' }} />
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
