/**
 * CodeGraph service — "Building Relationships".
 *
 * Turns parsed documents into the structural graph stored in the CodeGraph DB:
 *   - one node per file
 *   - one symbol row per declared function/class/method (for "where is X defined?")
 *   - one edge per resolved internal import (for "what imports / depends on Y?")
 *
 * Also exposes query helpers used by the /api/graph and /api/symbols routes and by hybrid
 * retrieval in the RAG engine.
 */
import { appState } from '../state.js';
import { extractImports, resolveImport } from './imports.js';

/**
 * Build the graph from parsed documents and persist it to the CodeGraph DB.
 * Assumes the store was already reset (resetIndex() is called once per ingest).
 *
 * @param {Array} parsedDocs documents with { relPath, language, content, structuredSymbols }
 * @returns {Promise<{ symbolCount: number, edgeCount: number }>}
 */
export async function buildCodeGraph(parsedDocs) {
  const store = appState.codeGraph;
  const fileSet = new Set(parsedDocs.map((d) => d.relPath));

  const files = parsedDocs.map((d) => ({ relPath: d.relPath, language: d.language }));

  const symbols = [];
  for (const doc of parsedDocs) {
    for (const sym of doc.structuredSymbols || []) {
      symbols.push({ name: sym.name, kind: sym.kind, relPath: doc.relPath, line: sym.line });
    }
  }

  const edges = [];
  for (const doc of parsedDocs) {
    const seen = new Set();
    for (const spec of extractImports(doc.content)) {
      const target = resolveImport(doc.relPath, spec, fileSet);
      if (target && target !== doc.relPath && !seen.has(target)) {
        seen.add(target);
        edges.push({ from: doc.relPath, to: target, kind: 'import' });
      }
    }
  }

  await store.insertFiles(files);
  if (symbols.length) await store.insertSymbols(symbols);
  if (edges.length) await store.insertEdges(edges);

  return { symbolCount: symbols.length, edgeCount: edges.length };
}

// --- Query helpers (thin wrappers over the store; all async) ----------------

export async function findSymbol(name, opts) {
  return appState.codeGraph.findSymbol(name, opts);
}

export async function dependentsOf(relPath) {
  return appState.codeGraph.dependentsOf(relPath);
}

export async function dependenciesOf(relPath) {
  return appState.codeGraph.dependenciesOf(relPath);
}

export async function getGraph(limit) {
  return appState.codeGraph.getGraph(limit);
}

export async function symbolsIn(relPath) {
  return appState.codeGraph.symbolsIn(relPath);
}

export default buildCodeGraph;
