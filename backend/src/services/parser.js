/**
 * Parser.
 *
 * Step 2 of the pipeline. We don't build a full AST here (that would mean a parser per language);
 * instead we do cheap, language-agnostic enrichment that meaningfully improves retrieval:
 *   - map file extension -> human language name
 *   - extract "symbols" (function / class / def names) with a few regexes, used to boost relevance
 *
 * This keeps the project dependency-free and easy to explain, while still being useful. The design
 * doc discusses when you'd graduate to a real AST (tree-sitter).
 */

const EXT_TO_LANGUAGE = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.cs': 'csharp',
  '.php': 'php', '.swift': 'swift', '.scala': 'scala',
  '.sh': 'shell', '.bash': 'shell',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.md': 'markdown', '.mdx': 'markdown', '.txt': 'text',
  '.html': 'html', '.css': 'css', '.scss': 'scss', '.vue': 'vue', '.svelte': 'svelte',
  '.sql': 'sql', '.graphql': 'graphql', '.proto': 'protobuf',
};

/** Regexes that capture declared symbols across common languages, tagged with a `kind`. */
const SYMBOL_PATTERNS = [
  { kind: 'function', re: /\bfunction\s+([A-Za-z_$][\w$]*)/g },            // function foo
  { kind: 'class', re: /\bclass\s+([A-Za-z_$][\w$]*)/g },                  // class Foo
  { kind: 'function', re: /\bdef\s+([A-Za-z_][\w]*)/g },                   // def foo (python/ruby)
  { kind: 'function', re: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g }, // const foo = (
  { kind: 'function', re: /\bfunc\s+([A-Za-z_][\w]*)/g },                  // func Foo (go)
  { kind: 'function', re: /\bfn\s+([A-Za-z_][\w]*)/g },                    // fn foo (rust)
  { kind: 'method', re: /\b(?:public|private|protected)\s+\w[\w<>]*\s+([A-Za-z_][\w]*)\s*\(/g }, // java/c# methods
];

/** Compute the 1-based line number of a character offset. */
function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Extract structured symbols from source text.
 * @returns {Array<{ name: string, kind: string, line: number }>}
 */
export function extractStructuredSymbols(content) {
  const seen = new Set();
  const out = [];
  for (const { kind, re } of SYMBOL_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      if (!name) continue;
      const key = `${name}@${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, kind, line: lineOf(content, m.index) });
    }
  }
  return out;
}

/** Extract a de-duplicated list of symbol names from source text (back-compat helper). */
export function extractSymbols(content) {
  return [...new Set(extractStructuredSymbols(content).map((s) => s.name))];
}

export function detectLanguage(ext) {
  return EXT_TO_LANGUAGE[ext] || 'text';
}

/**
 * Enrich raw documents with language + symbols.
 * @param {Array<{path,relPath,ext,content}>} documents
 * @returns {Array<{...document, language, symbols, lineCount}>}
 */
export function parseDocuments(documents) {
  return documents.map((doc) => {
    const structuredSymbols = extractStructuredSymbols(doc.content);
    return {
      ...doc,
      language: detectLanguage(doc.ext),
      structuredSymbols,
      symbols: [...new Set(structuredSymbols.map((s) => s.name))],
      lineCount: doc.content.split('\n').length,
    };
  });
}

export default parseDocuments;
