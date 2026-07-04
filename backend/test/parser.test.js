import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectLanguage, extractStructuredSymbols, extractSymbols, parseDocuments } from '../src/services/parser.js';

test('detectLanguage maps known extensions and falls back to text', () => {
  assert.equal(detectLanguage('.js'), 'javascript');
  assert.equal(detectLanguage('.py'), 'python');
  assert.equal(detectLanguage('.rs'), 'rust');
  assert.equal(detectLanguage('.weird'), 'text');
});

test('extracts JS functions, classes, and arrow consts with line numbers', () => {
  const src = 'function foo() {}\nclass Bar {}\nconst baz = async (x) => x;\n';
  const syms = extractStructuredSymbols(src);
  const byName = Object.fromEntries(syms.map((s) => [s.name, s]));
  assert.equal(byName.foo.kind, 'function');
  assert.equal(byName.foo.line, 1);
  assert.equal(byName.Bar.kind, 'class');
  assert.equal(byName.Bar.line, 2);
  assert.equal(byName.baz.line, 3);
});

test('extracts python defs and go/rust functions', () => {
  assert.ok(extractSymbols('def handler(event):\n    pass').includes('handler'));
  assert.ok(extractSymbols('func ProcessOrder(o Order) {}').includes('ProcessOrder'));
  assert.ok(extractSymbols('fn compute_total(items: &[Item]) -> u64 {}').includes('compute_total'));
});

test('extractSymbols de-duplicates names', () => {
  const names = extractSymbols('function dup() {}\nfunction dup() {}');
  assert.deepEqual(names, ['dup']);
});

test('parseDocuments enriches with language, symbols, and lineCount', () => {
  const [parsed] = parseDocuments([
    { path: '/x/a.js', relPath: 'a.js', ext: '.js', content: 'function hi() {}\n// end' },
  ]);
  assert.equal(parsed.language, 'javascript');
  assert.deepEqual(parsed.symbols, ['hi']);
  assert.equal(parsed.lineCount, 2);
  assert.equal(parsed.structuredSymbols[0].kind, 'function');
});
