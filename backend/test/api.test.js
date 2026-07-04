/**
 * API integration test: boots the real Express app with the mock provider and in-memory
 * persistence, ingests a tiny fixture "repo" from a temp dir, and exercises every route.
 *
 * Env is set BEFORE the app is imported because config.js reads process.env at module load.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AI_PROVIDER = 'mock';
process.env.PERSIST = 'false';
process.env.NODE_ENV = 'development';
process.env.ALLOW_LOCAL_INGEST = 'true';
process.env.ASK_RATE_LIMIT = '1000';
process.env.INGEST_RATE_LIMIT = '1000';

let server;
let base;
let fixtureDir;

before(async () => {
  // Tiny fixture codebase: two JS files with an internal import, plus a doc.
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cka-test-'));
  fs.mkdirSync(path.join(fixtureDir, 'src'));
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'payment.js'),
    "import { log } from './log.js';\n\nexport function processPayment(order) {\n  log('paying');\n  return order.total;\n}\n"
  );
  fs.writeFileSync(
    path.join(fixtureDir, 'src', 'log.js'),
    "export function log(msg) {\n  console.log(msg);\n}\n"
  );
  fs.writeFileSync(path.join(fixtureDir, 'README.md'), '# Fixture\nHandles payments.\n');

  const { createApp } = await import('../src/app.js');
  const app = await createApp();
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server?.close();
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

const get = async (p) => (await fetch(`${base}${p}`)).json();
const post = async (p, body) =>
  fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('health reports ok with the sqlite-memory driver', async () => {
  const h = await get('/api/health');
  assert.equal(h.status, 'ok');
  assert.equal(h.persistenceDriver, 'sqlite-memory');
});

test('ask before ingest returns 409', async () => {
  const res = await post('/api/ask', { question: 'anything' });
  assert.equal(res.status, 409);
});

test('ingest indexes the fixture repo', async () => {
  const res = await post('/api/ingest', { path: fixtureDir });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.codebase.fileCount, 3);
  assert.ok(body.codebase.chunkCount >= 3);
  assert.ok(body.codebase.symbolCount >= 2); // processPayment + log
  assert.ok(body.codebase.edgeCount >= 1); // payment.js -> log.js
});

test('ask returns an answer with sources', async () => {
  const res = await post('/api/ask', { question: 'how are payments processed?' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.model, 'mock-llm');
  assert.ok(body.answer.length > 0);
  assert.ok(body.sources.length > 0);
  assert.ok(body.sources[0].relPath);
});

test('symbols route finds processPayment with its location', async () => {
  const body = await get('/api/symbols?name=processPayment');
  assert.equal(body.count, 1);
  assert.equal(body.matches[0].relPath, 'src/payment.js');
  assert.equal(body.matches[0].kind, 'function');
});

test('graph route returns nodes, the import edge, and counts', async () => {
  const body = await get('/api/graph');
  assert.equal(body.nodes.length, 3);
  assert.ok(body.edges.some((e) => e.from === 'src/payment.js' && e.to === 'src/log.js'));
  assert.equal(body.counts.files, 3);
});

test('file route reports dependencies, dependents, and wiki', async () => {
  const body = await get(`/api/file?relPath=${encodeURIComponent('src/log.js')}`);
  assert.deepEqual(body.dependents, ['src/payment.js']);
  assert.ok(body.wiki?.summary);
});

test('wiki route lists a card per file', async () => {
  const body = await get('/api/wiki');
  assert.equal(body.count, 3);
});

test('files route aggregates chunk counts per file', async () => {
  const body = await get('/api/files');
  assert.equal(body.fileCount, 3);
  assert.ok(body.totalChunks >= 3);
});

test('diagram route returns mermaid source', async () => {
  const body = await get('/api/diagram?type=dependency');
  assert.ok(body.mermaid.startsWith('graph'));
});

test('unknown route returns 404 json', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
});
