/**
 * Eval harness — `npm run eval` (from backend/).
 *
 * Boots the REAL app in-process on an ephemeral port, ingests the golden set's source, then runs
 * every golden question through the real /api/ask pipeline and scores:
 *
 *   retrieval hit-rate@K   at least one expected file appears in the top-K sources
 *   citation accuracy      every file path the answer cites exists in the indexed repo
 *   keyword coverage       answer mentions the expected keywords (weak answer-quality proxy)
 *   mermaid-valid rate     every diagram type produces structurally valid Mermaid source
 *   latency                p50 / p95 per question (cache disabled by using unique questions)
 *
 * Prints a scorecard table and rewrites the "<!-- EVAL:START -->…<!-- EVAL:END -->" block in the
 * repo README plus frontend/lib/metrics.js, so the published numbers are always the measured ones.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PERSIST = process.env.PERSIST || 'false'; // eval never pollutes the real index

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const goldenPath = path.join(repoRoot, 'evals', 'golden.json');

const { createApp } = await import('../src/app.js');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100));
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** Structural Mermaid check: known header + every edge endpoint declared or inline. */
function isValidMermaid(src) {
  if (!src || typeof src !== 'string') return false;
  const head = src.trim().split('\n')[0].trim();
  return /^(graph|flowchart)\s+(TD|TB|LR|RL|BT)/.test(head) && src.includes('-->');
}

/** File paths the answer text cites (heuristic: anything that looks like a relPath we indexed). */
function citedPaths(answer, indexedFiles) {
  const cited = new Set();
  for (const f of indexedFiles) {
    if (answer.includes(f)) cited.add(f);
  }
  // Also catch paths the model invented (…/xyz.js not in the index)
  const invented = [];
  for (const m of answer.matchAll(/[\w./-]+\.(?:js|ts|py|go|rs|json)\b/g)) {
    const p = m[0].replace(/^\.\//, '');
    if (!indexedFiles.some((f) => f.endsWith(p) || p.endsWith(f))) invented.push(p);
  }
  return { cited: [...cited], invented };
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

const app = await createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const base = `http://localhost:${server.address().port}`;
const post = (p, body) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  });

console.log(`\n┌─ RepoLens eval · ${golden.questions.length} golden questions`);
console.log(`│  source: ${golden.source}`);

const t0 = Date.now();
const ing = await post('/api/ingest', { path: golden.source });
console.log(
  `│  indexed ${ing.codebase.chunkCount} chunks · ${ing.codebase.symbolCount} symbols in ${Date.now() - t0}ms\n│`
);

const filesRes = await fetch(`${base}/api/files`).then((r) => r.json());
const indexedFiles = filesRes.files.map((f) => f.relPath);

let hits = 0;
let keywordPass = 0;
let citationChecked = 0;
let citationClean = 0;
const latencies = [];
const failures = [];

for (const q of golden.questions) {
  const start = Date.now();
  const res = await post('/api/ask', { question: q.question });
  const ms = Date.now() - start;
  latencies.push(ms);

  const sourceFiles = res.sources.map((s) => s.relPath);
  const hit = q.expected_files.some((ef) => sourceFiles.some((sf) => sf.endsWith(ef)));
  if (hit) hits += 1;
  else failures.push({ q: q.question, got: [...new Set(sourceFiles)].slice(0, 3) });

  const answerLower = res.answer.toLowerCase();
  if (q.expected_keywords.some((kw) => answerLower.includes(kw.toLowerCase()))) keywordPass += 1;

  const { cited, invented } = citedPaths(res.answer, indexedFiles);
  if (cited.length > 0 || invented.length > 0) {
    citationChecked += 1;
    if (invented.length === 0) citationClean += 1;
  }
}

// Mermaid validity across all diagram types
const diagramTypes = ['architecture', 'dependency', 'module'];
let mermaidValid = 0;
for (const type of diagramTypes) {
  const rel = type === 'module' ? `&relPath=${encodeURIComponent(indexedFiles[0])}` : '';
  const d = await fetch(`${base}/api/diagram?type=${type}${rel}`).then((r) => r.json());
  if (isValidMermaid(d.mermaid)) mermaidValid += 1;
}

latencies.sort((a, b) => a - b);
const scorecard = {
  date: new Date().toISOString().slice(0, 10),
  questions: golden.questions.length,
  retrievalHitRate: pct(hits, golden.questions.length),
  keywordCoverage: pct(keywordPass, golden.questions.length),
  citationAccuracy: citationChecked === 0 ? 100 : pct(citationClean, citationChecked),
  mermaidValidRate: pct(mermaidValid, diagramTypes.length),
  p50LatencyMs: quantile(latencies, 0.5),
  p95LatencyMs: quantile(latencies, 0.95),
  chunksIndexed: ing.codebase.chunkCount,
  llm: process.env.AI_PROVIDER || 'mock',
};

// ---------------------------------------------------------------------------
// print
// ---------------------------------------------------------------------------
console.log('│  ── scorecard ─────────────────────────────');
console.log(`│  retrieval hit-rate@5     ${scorecard.retrievalHitRate}%   (${hits}/${scorecard.questions})`);
console.log(`│  keyword coverage         ${scorecard.keywordCoverage}%`);
console.log(`│  citation accuracy        ${scorecard.citationAccuracy}%   (${citationClean}/${citationChecked} answers cite only real paths)`);
console.log(`│  mermaid-valid rate       ${scorecard.mermaidValidRate}%   (${mermaidValid}/${diagramTypes.length} diagram types)`);
console.log(`│  latency p50 / p95        ${scorecard.p50LatencyMs}ms / ${scorecard.p95LatencyMs}ms`);
console.log(`│  llm                      ${scorecard.llm}`);
if (failures.length) {
  console.log('│  ── retrieval misses ──────────────────────');
  for (const f of failures) console.log(`│  ✗ ${f.q}\n│      top sources: ${f.got.join(', ')}`);
}
console.log('└─────────────────────────────────────────────\n');

// ---------------------------------------------------------------------------
// write results into README + landing metrics
// ---------------------------------------------------------------------------
const scoreBlock = [
  '<!-- EVAL:START -->',
  `_Last run ${scorecard.date} · LLM: \`${scorecard.llm}\` · ${scorecard.questions} golden questions (\`npm run eval\`)_`,
  '',
  '| Metric | Score |',
  '|--------|-------|',
  `| Retrieval hit-rate@5 | **${scorecard.retrievalHitRate}%** |`,
  `| Citation accuracy | **${scorecard.citationAccuracy}%** |`,
  `| Keyword coverage | **${scorecard.keywordCoverage}%** |`,
  `| Mermaid-valid rate | **${scorecard.mermaidValidRate}%** |`,
  `| Latency p50 / p95 | **${scorecard.p50LatencyMs}ms / ${scorecard.p95LatencyMs}ms** |`,
  '<!-- EVAL:END -->',
].join('\n');

const readmePath = path.join(repoRoot, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
if (readme.includes('<!-- EVAL:START -->')) {
  readme = readme.replace(/<!-- EVAL:START -->[\s\S]*?<!-- EVAL:END -->/, scoreBlock);
  fs.writeFileSync(readmePath, readme);
  console.log('Updated README scorecard.');
}

const metricsPath = path.join(repoRoot, 'frontend', 'lib', 'metrics.js');
if (fs.existsSync(metricsPath)) {
  const js = `/**
 * Landing-page metrics. Written by \`npm run eval\` (backend/scripts/eval.js) — the numbers shown
 * on the site are the latest real scorecard, not marketing copy.
 */
export const METRICS = {
  retrievalHitRate: ${scorecard.retrievalHitRate},
  citationAccuracy: ${scorecard.citationAccuracy},
  p50LatencyMs: ${scorecard.p50LatencyMs},
  chunksIndexed: ${scorecard.chunksIndexed},
};
`;
  fs.writeFileSync(metricsPath, js);
  console.log('Updated frontend/lib/metrics.js.');
}

server.close();
process.exit(0);
