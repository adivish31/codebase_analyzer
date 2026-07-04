import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractImports, resolveImport } from '../src/services/imports.js';

test('extracts ES imports, requires, and python imports', () => {
  const src = [
    "import fs from 'node:fs';",
    "import './side-effect.js';",
    "const x = require('lodash');",
    'from collections import OrderedDict',
    'import os',
  ].join('\n');
  const specs = extractImports(src);
  assert.ok(specs.includes('node:fs'));
  assert.ok(specs.includes('./side-effect.js'));
  assert.ok(specs.includes('lodash'));
  assert.ok(specs.includes('collections'));
  assert.ok(specs.includes('os'));
});

test('resolveImport resolves ./ and ../ against the importing file', () => {
  const files = new Set(['src/a/b.js', 'src/c/d.js', 'src/c/index.js']);
  assert.equal(resolveImport('src/a/b.js', '../c/d', files), 'src/c/d.js');
  assert.equal(resolveImport('src/a/b.js', '../c', files), 'src/c/index.js');
});

test('resolveImport returns null for external packages and misses', () => {
  const files = new Set(['src/a.js']);
  assert.equal(resolveImport('src/a.js', 'express', files), null);
  assert.equal(resolveImport('src/a.js', './missing', files), null);
});

test('resolveImport matches exact path when the extension is written out', () => {
  const files = new Set(['lib/util.py']);
  assert.equal(resolveImport('lib/main.py', './util.py', files), 'lib/util.py');
});
