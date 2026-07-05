'use client';
import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';

const QUESTION = 'Where does ingestion decide which files to skip?';

const ANSWER =
  'File filtering happens in services/ingestion.js. The walk() function skips ' +
  'directories in IGNORED_DIRS (node_modules, .git, dist…), files over 200 KB, ' +
  'lockfiles, and anything failing the isBinary() NUL-byte check. Only extensions ' +
  'in SOURCE_EXTENSIONS survive to the parser.';

const CITATIONS = [
  { path: 'services/ingestion.js', lines: '25–46' },
  { path: 'services/ingestion.js', lines: '74–120' },
  { path: 'services/parser.js', lines: '13–28' },
];

const MERMAID_SRC = `graph LR
  A[ingestion.js] --> B[parser.js]
  B --> C[chunker.js]
  C --> D[embeddings]
  D --> E[(vector store)]
  B --> F[(code graph)]`;

/**
 * A scripted replay of the real workspace answering a question — typed question,
 * token-streamed answer, citation chips, then a real Mermaid render. Plays once
 * when scrolled into view; reduced-motion shows the finished state immediately.
 */
export default function DemoStream() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduce = useReducedMotion();

  const [typed, setTyped] = useState(reduce ? QUESTION : '');
  const [streamed, setStreamed] = useState(reduce ? ANSWER : '');
  const [phase, setPhase] = useState(reduce ? 'done' : 'idle'); // idle → typing → streaming → done
  const diagramRef = useRef(null);

  // Phase 1: type the question
  useEffect(() => {
    if (!inView || reduce || phase !== 'idle') return;
    setPhase('typing');
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(QUESTION.slice(0, i));
      if (i >= QUESTION.length) {
        clearInterval(id);
        setTimeout(() => setPhase('streaming'), 350);
      }
    }, 28);
    return () => clearInterval(id);
  }, [inView, reduce, phase]);

  // Phase 2: stream the answer word by word
  useEffect(() => {
    if (phase !== 'streaming') return;
    const words = ANSWER.match(/\S+\s*/g) || [];
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setStreamed(words.slice(0, i).join(''));
      if (i >= words.length) {
        clearInterval(id);
        setPhase('done');
      }
    }, 34);
    return () => clearInterval(id);
  }, [phase]);

  // Phase 3: real Mermaid render once the answer lands
  useEffect(() => {
    if (phase !== 'done' || !diagramRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        const dark = document.documentElement.dataset.theme !== 'light';
        mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral' });
        const { svg } = await mermaid.render(`demo-${Date.now()}`, MERMAID_SRC);
        if (!cancelled && diagramRef.current) diagramRef.current.innerHTML = svg;
      } catch {
        /* the demo silently skips the diagram if mermaid fails */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-[10px] border border-line bg-surface text-left"
    >
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="label-mono">cairn · workspace</span>
        <span className="flex gap-1.5">
          <i className="h-2 w-2 rounded-full bg-line-strong" />
          <i className="h-2 w-2 rounded-full bg-line-strong" />
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* question */}
        <div className="rounded-[8px] bg-accent-dim px-3 py-2 font-mono text-[13px] text-ink">
          {typed}
          {phase === 'typing' && <span className="animate-pulse">▌</span>}
        </div>

        {/* streamed answer */}
        {(phase === 'streaming' || phase === 'done') && (
          <div className="rounded-[8px] bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink">
            {streamed}
            {phase === 'streaming' && <span className="animate-pulse text-accent">▌</span>}
          </div>
        )}

        {/* citations */}
        {phase === 'done' && (
          <div className="flex flex-wrap gap-1.5">
            {CITATIONS.map((c, i) => (
              <span
                key={i}
                className="rounded-[6px] border border-line px-2 py-1 font-mono text-[11px] text-muted"
              >
                {c.path}
                <span className="text-accent">:{c.lines}</span>
              </span>
            ))}
          </div>
        )}

        {/* real mermaid render */}
        {phase === 'done' && (
          <div ref={diagramRef} className="mermaid-host overflow-x-auto pt-1" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
