import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VectorStore, dot, cosineSimilarity } from '../src/services/vectorStore.js';

test('dot product of equal-length vectors', () => {
  assert.equal(dot([1, 2, 3], [4, 5, 6]), 32);
});

test('cosineSimilarity is 1 for identical directions and 0 for orthogonal', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [2, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 5])) < 1e-9);
});

test('search returns records sorted by similarity, capped at k', () => {
  const store = new VectorStore();
  store.add({ id: 'a', vector: [1, 0, 0], metadata: { relPath: 'a' } });
  store.add({ id: 'b', vector: [0.9, 0.1, 0], metadata: { relPath: 'b' } });
  store.add({ id: 'c', vector: [0, 0, 1], metadata: { relPath: 'c' } });

  const results = store.search([1, 0, 0], 2);
  assert.equal(results.length, 2);
  assert.equal(results[0].id, 'a');
  assert.equal(results[1].id, 'b');
  assert.ok(results[0].score >= results[1].score);
});

test('search on an empty store returns an empty array', () => {
  assert.deepEqual(new VectorStore().search([1, 2, 3], 5), []);
});

test('size reflects the number of added records', () => {
  const store = new VectorStore();
  assert.equal(store.size, 0);
  store.add({ id: 'x', vector: [1], metadata: {} });
  assert.equal(store.size, 1);
});
