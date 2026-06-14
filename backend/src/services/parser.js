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

/** Regexes that capture declared symbol names across common languages. */
const SYMBOL_PATTERNS = [
  /\bfunction\s+([A-Za-z_$][\w$]*)/g,          // function foo
  /\bclass\s+([A-Za-z_$][\w$]*)/g,             // class Foo
  /\bdef\s+([A-Za-z_][\w]*)/g,                 // def foo (python/ruby)
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g, // const foo = (
  /\bfunc\s+([A-Za-z_][\w]*)/g,                // func Foo (go)
  /\b(?:public|private|protected)\s+\w+\s+([A-Za-z_][\w]*)\s*\(/g,    // java/c# methods
];

/** Extract a de-duplicated list of symbol names from source text. */
export function extractSymbols(content) {
  const found = new Set();
  for (const re of SYMBOL_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      if (m[1]) found.add(m[1]);
    }
  }
  return [...found];
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
  return documents.map((doc) => ({
    ...doc,
    language: detectLanguage(doc.ext),
    symbols: extractSymbols(doc.content),
    lineCount: doc.content.split('\n').length,
  }));
}

export default parseDocuments;
