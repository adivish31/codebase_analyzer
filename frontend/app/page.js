import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import BlurText from '../components/motion/BlurText';
import CountUp from '../components/motion/CountUp';
import SpotlightCard from '../components/ui/SpotlightCard';
import DemoStream from '../components/landing/DemoStream';
import ThemeToggle from '../components/ThemeToggle';
import { METRICS } from '../lib/metrics';

const REPO_URL = 'https://github.com/adivish31/codebase_analyzer';

export const metadata = {
  title: 'RepoLens — bring any codebase into focus',
};

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* ───────────────────────── nav ───────────────────────── */}
      <nav className="hairline-b sticky top-0 z-40 bg-canvas/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between px-6 py-3.5">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-lg font-semibold tracking-tight">RepoLens</span>
            <span className="label-mono hidden sm:inline">codebase intelligence</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="#how" className="hidden text-[13px] text-muted transition-colors hover:text-ink sm:inline">
              How it works
            </a>
            <a href="#metrics" className="hidden text-[13px] text-muted transition-colors hover:text-ink sm:inline">
              Metrics
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted transition-colors hover:text-ink"
            >
              GitHub
            </a>
            <ThemeToggle />
            <Link
              href="/workspace"
              className="rounded-[8px] bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
            >
              Open workspace
            </Link>
          </div>
        </div>
      </nav>

      {/* ───────────────────────── hero ───────────────────────── */}
      <section className="mx-auto max-w-[1160px] px-6 pb-20 pt-16 md:pt-24">
        <div className="grid items-start gap-12 md:grid-cols-12">
          {/* headline — weighted left, 7 cols */}
          <div className="md:col-span-7">
            <p className="label-mono mb-5">// codebase intelligence, self-hosted</p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-[3.4rem]">
              <BlurText text="Ask your codebase a question." />
              <br />
              <span className="text-accent">
                <BlurText text="Get the exact lines back." delay={0.5} />
              </span>
            </h1>
            <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-muted">
              RepoLens clones a repo, chunks it into a searchable vector index, and builds a code
              graph of every symbol and import. Then it answers in plain language — streamed,
              with <span className="font-mono text-[13px] text-ink">file:line</span> citations
              and diagrams it draws itself.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/workspace"
                className="inline-flex items-center gap-2 rounded-[8px] bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
              >
                Index a repo <ArrowRight size={15} />
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
              >
                Read the source
              </a>
            </div>
          </div>

          {/* product visual — right, 5 cols, dot-grid (the ONE decorated section) */}
          <div className="dot-grid rounded-[12px] p-4 md:col-span-5 md:p-6">
            <DemoStream />
          </div>
        </div>
      </section>

      {/* ───────────────────────── problem ───────────────────────── */}
      <section className="hairline-t">
        <div className="mx-auto max-w-[1160px] px-6 py-16">
          <div className="max-w-[46ch]">
            <p className="label-mono mb-4">// the problem</p>
            <p className="font-display text-2xl font-medium leading-snug tracking-tight md:text-[1.7rem]">
              You inherit 80,000 lines and a README that lies. Onboarding is grep, guesswork, and
              interrupting the one person who remembers why.
            </p>
          </div>
        </div>
      </section>

      {/* ───────────────────────── how it works ───────────────────────── */}
      <section id="how" className="hairline-t">
        <div className="mx-auto max-w-[1160px] px-6 py-16">
          <p className="label-mono mb-8">// how it works</p>
          {/* asymmetric: 5 / 4 / 3 */}
          <div className="grid gap-4 md:grid-cols-12">
            <SpotlightCard className="p-6 md:col-span-5">
              <p className="label-mono mb-3 text-accent">// 01 — index</p>
              <h3 className="font-display text-lg font-medium">Clone, chunk, embed</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                Shallow-clones any GitHub repo, splits source into line-aware overlapping chunks,
                and embeds each one — 768-dim Gemini vectors, L2-normalised, persisted to SQLite
                or Postgres.
              </p>
              <pre className="mt-4 overflow-x-auto rounded-[8px] bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-muted">
{`POST /api/ingest { "source": "https://github.com/…" }
→ 126 chunks · 92 symbols · 83 edges  (1.4s)`}
              </pre>
            </SpotlightCard>

            <SpotlightCard className="p-6 md:col-span-4">
              <p className="label-mono mb-3 text-accent">// 02 — graph</p>
              <h3 className="font-display text-lg font-medium">Map every relationship</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                A regex-free-zone it is not — but it works: declared symbols with line numbers,
                plus resolved import edges between files, queryable in SQL.
              </p>
              <pre className="mt-4 overflow-x-auto rounded-[8px] bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-muted">
{`GET /api/symbols?name=chunk
→ chunkDocument · services/chunker.js:28`}
              </pre>
            </SpotlightCard>

            <SpotlightCard className="p-6 md:col-span-3">
              <p className="label-mono mb-3 text-accent">// 03 — ask</p>
              <h3 className="font-display text-lg font-medium">Grounded answers</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                Hybrid retrieval — cosine similarity re-ranked by path and symbol matches — feeds
                an LLM that must cite its sources or admit it can't.
              </p>
            </SpotlightCard>
          </div>
        </div>
      </section>

      {/* ───────────────────────── metrics ───────────────────────── */}
      <section id="metrics" className="hairline-t">
        <div className="mx-auto max-w-[1160px] px-6 py-16">
          <p className="label-mono mb-2">// measured, not promised</p>
          <p className="mb-10 max-w-[52ch] text-[13px] text-muted">
            Numbers from <span className="font-mono">npm run eval</span> — a golden-set harness
            that runs real questions through the real pipeline. Re-run it yourself.
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
            <div>
              <div className="font-display text-4xl font-semibold tracking-tight text-accent">
                <CountUp value={METRICS.retrievalHitRate} suffix="%" />
              </div>
              <p className="label-mono mt-2">retrieval hit-rate@5</p>
            </div>
            <div>
              <div className="font-display text-4xl font-semibold tracking-tight text-accent">
                <CountUp value={METRICS.citationAccuracy} suffix="%" />
              </div>
              <p className="label-mono mt-2">citation accuracy</p>
            </div>
            <div>
              <div className="font-display text-4xl font-semibold tracking-tight text-accent">
                <CountUp value={METRICS.p50LatencyMs / 1000} decimals={1} suffix="s" />
              </div>
              <p className="label-mono mt-2">p50 answer latency</p>
            </div>
            <div>
              <div className="font-display text-4xl font-semibold tracking-tight text-accent">
                <CountUp value={METRICS.chunksIndexed} />
              </div>
              <p className="label-mono mt-2">chunks · demo repo</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── tech ───────────────────────── */}
      <section className="hairline-t">
        <div className="mx-auto max-w-[1160px] px-6 py-16">
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-4">
              <p className="label-mono mb-3">// under the hood</p>
              <p className="text-[13.5px] leading-relaxed text-muted">
                Three runtime dependencies on the API. No vector database to operate — vectors
                persist as rows, search runs in memory. The whole pipeline is readable in an
                afternoon.
              </p>
            </div>
            <div className="md:col-span-8">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 font-mono text-[12.5px] sm:grid-cols-2">
                {[
                  ['api', 'Express 4 · Node ≥18 · ESM'],
                  ['llm', 'Groq · llama-3.3-70b-versatile, streamed'],
                  ['embeddings', 'Gemini · gemini-embedding-001 · 768d'],
                  ['persistence', 'node:sqlite → Postgres via DATABASE_URL'],
                  ['retrieval', 'cosine + symbol/path re-rank (hybrid)'],
                  ['frontend', 'Next.js 16 · React 19 · Tailwind 4'],
                  ['diagrams', 'Mermaid 11, rendered client-side'],
                  ['hardening', 'helmet · per-IP rate limits · graceful shutdown'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3 border-b border-line pb-2.5">
                    <dt className="w-24 shrink-0 uppercase tracking-[0.08em] text-muted">{k}</dt>
                    <dd className="text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── footer ───────────────────────── */}
      <footer className="hairline-t">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-8">
          <p className="label-mono">repolens — built to be read</p>
          <div className="flex items-center gap-5 text-[13px] text-muted">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-ink">
              GitHub
            </a>
            <Link href="/workspace" className="transition-colors hover:text-ink">
              Workspace
            </Link>
            <span>MIT</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
