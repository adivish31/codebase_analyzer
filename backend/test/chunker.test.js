import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chunkDocument, chunkDocuments } from '../src/services/chunker.js';

const doc = (content, relPath = 'src/a.js') => ({ relPath, language: 'javascript', content, symbols: ['a'] });

test('small file becomes a single chunk covering every line', () => {
  const chunks = chunkDocument(doc('one\ntwo\nthree'), { size: 1000, overlap: 100 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].startLine, 1);
  assert.equal(chunks[0].endLine, 3);
  assert.equal(chunks[0].text, 'one\ntwo\nthree');
});

test('long file splits into multiple chunks that respect the size budget', () => {
  const lines = Array.from({ length: 100 }, (_, i) => `line number ${i} with some padding text`);
  const chunks = chunkDocument(doc(lines.join('\n')), { size: 400, overlap: 80 });
  assert.ok(chunks.length > 3, `expected several chunks, got ${chunks.length}`);
  // Every chunk ends roughly at the size budget (except possibly the last remainder).
  for (const c of chunks.slice(0, -1)) assert.ok(c.text.length >= 400);
});

test('consecutive chunks overlap so boundary-straddling content appears whole somewhere', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `alpha beta gamma delta line ${i}`);
  const chunks = chunkDocument(doc(lines.join('\n')), { size: 300, overlap: 60 });
  for (let i = 1; i < chunks.length; i++) {
    // Next chunk starts at or before the previous chunk's end line (the overlap tail).
    assert.ok(
      chunks[i].startLine <= chunks[i - 1].endLine,
      `chunk ${i} starts at ${chunks[i].startLine}, previous ended at ${chunks[i - 1].endLine}`
    );
  }
});

test('line numbers are 1-based and consistent with content', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `x${i}`);
  const chunks = chunkDocument(doc(lines.join('\n')), { size: 60, overlap: 10 });
  for (const c of chunks) {
    const lineCount = c.text.split('\n').length;
    assert.equal(c.endLine - c.startLine + 1, lineCount);
  }
});

test('chunk ids are unique across documents', () => {
  const docs = [doc('a\nb\nc', 'x.js'), doc('a\nb\nc', 'x.js')]; // same path on purpose
  const all = chunkDocuments(docs, { size: 10, overlap: 0 });
  const ids = new Set(all.map((c) => c.id));
  assert.equal(ids.size, all.length);
});

test('metadata (relPath, language, symbols) is carried onto every chunk', () => {
  const chunks = chunkDocument(doc('hello\nworld'), { size: 1000, overlap: 0 });
  assert.equal(chunks[0].relPath, 'src/a.js');
  assert.equal(chunks[0].language, 'javascript');
  assert.deepEqual(chunks[0].symbols, ['a']);
});
