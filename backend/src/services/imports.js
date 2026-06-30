/**
 * Import/dependency extraction — shared by the CodeGraph builder and the diagram service.
 *
 * Given a file's source text, find the modules it imports, and (where possible) resolve relative
 * imports to actual indexed file paths. Language-agnostic, regex-based — good enough to build a
 * useful file-to-file dependency graph without a full per-language AST.
 */

/** Language-spanning import/require/use patterns. Capture group 1 = the imported specifier. */
const IMPORT_PATTERNS = [
  /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g, // JS/TS: import x from 'y'  | import 'y'
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, //              JS/TS: require('y')
  /^\s*from\s+([\w.]+)\s+import\b/gm, //                     Python: from x import y
  /^\s*import\s+([\w.]+)/gm, //                              Python: import x
  /\buse\s+([\w:]+)/g, //                                    Rust: use a::b
];

/**
 * Extract a de-duplicated list of import specifiers from source text.
 * @param {string} text
 * @returns {string[]}
 */
export function extractImports(text) {
  const specs = new Set();
  for (const re of IMPORT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const spec = (m[1] || '').trim();
      if (spec && spec.length < 200 && !spec.includes(' ')) specs.add(spec);
    }
  }
  return [...specs];
}

/**
 * Resolve a relative import specifier (e.g. "./foo", "../bar/baz") against the importing file's
 * path, returning the matching indexed file path if one exists in `fileSet`.
 *
 * @param {string} fromRel  the importing file's relative path (e.g. "src/a/b.js")
 * @param {string} spec     the import specifier (e.g. "../c/d")
 * @param {Set<string>} fileSet  all indexed relative paths
 * @returns {string|null}
 */
export function resolveImport(fromRel, spec, fileSet) {
  if (!spec.startsWith('.')) return null; // external package — not an internal edge

  const baseDir = fromRel.split('/').slice(0, -1);
  const stack = [...baseDir];
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const base = stack.join('/');

  const candidates = [
    base,
    `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.cjs`,
    `${base}.py`, `${base}.go`, `${base}.rs`,
    `${base}/index.js`, `${base}/index.ts`, `${base}/index.jsx`, `${base}/index.tsx`,
    `${base}/__init__.py`,
  ];
  return candidates.find((c) => fileSet.has(c)) || null;
}

export default { extractImports, resolveImport };
