'use client';
import { useState } from 'react';
import { api } from '../lib/api';

// Q&A over the ingested codebase. Each AI answer shows the source chunks it used.
export default function Chat({ enabled }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setError(''); setLoading(true);
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

  return (
    <section className="panel">
      <h2>2 · Ask about the code</h2>
      {!enabled && <p className="muted">Ingest a codebase first.</p>}

      <div>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <pre>{m.text}</pre>
            {m.sources?.length > 0 && (
              <div className="sources">
                {m.sources.map((s, j) => (
                  <div key={j} className="source">
                    {s.relPath}:{s.startLine}-{s.endLine} · score {s.score}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="row">
        <input
          placeholder="How does authentication work? What calls processPayment?"
          value={question}
          disabled={!enabled || loading}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
        />
        <button onClick={ask} disabled={!enabled || loading || !question}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
