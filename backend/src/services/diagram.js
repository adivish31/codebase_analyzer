/**
 * Diagram-generation service  [TEAMMATE-OWNED — generated for hand-off, edit freely].
 *
 * Produces Mermaid diagram source strings describing the ingested codebase. The frontend renders
 * the returned Mermaid text with mermaid.js.
 *
 * IMPORTANT (decoupling): this module reads ONLY from the shared vector store
 * (appState.vectorStore.records), so it is purely additive — it requires no changes to the
 * backend files Aditya committed. It reconstructs per-file content by concatenating that file's
 * chunks, which is enough to scan import/require statements.
 *
 * Diagram types:
 *   - "dependency": file -> file edges from import/require statements
 *   - "architecture": top-level folders and how many files each holds
 *   - "module": symbols declared in a single file
 */
import { appState } from '../state.js';

/** Group chunk records back into { relPath -> { language, text } }. */
function reconstructFiles() {
  const files = new Map();
  for (const rec of appState.vectorStore.records) {
    const { relPath, language, text } = rec.metadata;
    if (!files.has(relPath)) files.set(relPath, { language, parts: [] });
    files.get(relPath).parts.push(text);
  }
  const out = new Map();
  for (const [relPath, { language, parts }] of files) {
    out.set(relPath, { language, content: parts.join('\n') });
  }
  return out;
}

/** Extract imported module specifiers from JS/TS-ish source. */
function extractImports(content) {
  const specs = new Set();
  const patterns = [
    /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g, // import ... from 'x'
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,              // require('x')
    /from\s+([\w.]+)\s+import/g,                       // python: from x import
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(content)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

/** Resolve a relative import specifier to an actual indexed file path, if possible. */
function resolveImport(fromRel, spec, fileSet) {
  if (!spec.startsWith('.')) return null; // external package, skip
  const baseDir = fromRel.split('/').slice(0, -1);
  const parts = spec.split('/');
  const stack = [...baseDir];
  for (const p of parts) {
    if (p === '.' || p === '') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  const base = stack.join('/');
  const candidates = [
    base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`,
    `${base}/index.js`, `${base}/index.ts`,
  ];
  return candidates.find((c) => fileSet.has(c)) || null;
}

/** Mermaid-safe node id. */
function nodeId(relPath, ids) {
  if (ids.has(relPath)) return ids.get(relPath);
  const id = `n${ids.size}`;
  ids.set(relPath, id);
  return id;
}

export function dependencyDiagram() {
  const files = reconstructFiles();
  const fileSet = new Set(files.keys());
  const ids = new Map();
  const lines = ['graph LR'];
  let edgeCount = 0;

  for (const [relPath, { content }] of files) {
    const from = nodeId(relPath, ids);
    lines.push(`  ${from}["${relPath}"]`);
    for (const spec of extractImports(content)) {
      const target = resolveImport(relPath, spec, fileSet);
      if (target) {
        const to = nodeId(target, ids);
        lines.push(`  ${from} --> ${to}`);
        edgeCount++;
      }
    }
  }

  if (edgeCount === 0) lines.push('  note["No internal import edges detected"]');
  return lines.join('\n');
}

export function architectureDiagram() {
  const files = reconstructFiles();
  const groups = new Map();
  for (const relPath of files.keys()) {
    const top = relPath.includes('/') ? relPath.split('/')[0] : '(root)';
    groups.set(top, (groups.get(top) || 0) + 1);
  }
  const lines = ['graph TD', '  root["Codebase"]'];
  let i = 0;
  for (const [dir, count] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
    const id = `g${i++}`;
    lines.push(`  ${id}["${dir}<br/>${count} file(s)"]`);
    lines.push(`  root --> ${id}`);
  }
  return lines.join('\n');
}

export function moduleDiagram(relPath) {
  const files = reconstructFiles();
  const file = files.get(relPath);
  if (!file) return `graph TD\n  err["File not indexed: ${relPath}"]`;
  const symbols = [...new Set(
    (file.content.match(/\b(?:function|class|def|func)\s+([A-Za-z_$][\w$]*)/g) || [])
      .map((s) => s.split(/\s+/)[1])
  )];
  const lines = ['graph TD', `  root["${relPath}"]`];
  symbols.slice(0, 30).forEach((sym, i) => {
    lines.push(`  s${i}["${sym}"]`);
    lines.push(`  root --> s${i}`);
  });
  if (symbols.length === 0) lines.push('  none["No symbols detected"]');
  return lines.join('\n');
}

/** Dispatch by type. */
export function generateDiagram(type = 'architecture', opts = {}) {
  switch (type) {
    case 'dependency': return { type, mermaid: dependencyDiagram() };
    case 'module':     return { type, mermaid: moduleDiagram(opts.relPath) };
    case 'architecture':
    default:           return { type: 'architecture', mermaid: architectureDiagram() };
  }
}

export default generateDiagram;
