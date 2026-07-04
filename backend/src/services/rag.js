/**
 * RAG engine — Retrieval-Augmented Generation, now hybrid.
 *
 * Retrieval combines two signals:
 *   1. SEMANTIC — embed the question, cosine-search the vector index (meaning-based).
 *   2. STRUCTURAL/LEXICAL — boost candidate chunks whose file path or text contains the question's
 *      keywords, and look up matching symbols in the CodeGraph DB (e.g. "payment" → where
 *      `processPayment` is defined). This is what makes "Where is the payment logic?" land on the
 *      right file even when the wording doesn't match the code.
 *
 * Flow: question -> embed -> over-fetch candidates -> re-rank (vector + keyword) -> symbol lookup
 *       -> build grounded prompt -> LLM -> answer + sources + symbol hints.
 *
 * See docs/concepts/01-rag.md and docs/interview-prep/02-rag-deep-dive.md.
 */
import { config } from '../config.js';
import { ApiError } from '../middleware/errorHandler.js';
import { appState } from '../state.js';
import { embedQuery } from './embeddings/index.js';
import { findSymbol } from './codeGraph.js';
import { complete } from '../providers/llm/index.js';

const SYSTEM_PROMPT =
  'You are a senior engineer explaining a codebase. Answer the question using ONLY the provided ' +
  'code context. Cite files by their path. If the context is insufficient, say so plainly.';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'how', 'does', 'do', 'what', 'where', 'which',
  'who', 'why', 'when', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'this', 'that',
  'it', 'work', 'works', 'code', 'function', 'logic', 'handle', 'handled', 'use', 'used', 'using',
]);

/** Extract meaningful keywords from the question (splits camelCase + snake_case). */
function keywordsOf(question) {
  return [
    ...new Set(
      question
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    ),
  ];
}

/** Keyword bonus for one candidate: matches in the path weigh more than matches in the body. */
function keywordBonus(meta, keywords) {
  if (keywords.length === 0) return 0;
  const path = meta.relPath.toLowerCase();
  const text = meta.text.toLowerCase();
  let bonus = 0;
  for (const kw of keywords) {
    if (path.includes(kw)) bonus += 0.15; // strong signal: filename/dir matches the topic
    if (text.includes(kw)) bonus += 0.03; // weaker signal: appears somewhere in the chunk
  }
  return Math.min(bonus, 0.6); // cap so lexical never fully overrides semantic
}

/** Assemble the user prompt: optional symbol hints + context blocks + the question. */
function buildPrompt(question, results, symbolHints) {
  const blocks = results
    .map((r, i) => {
      const m = r.metadata;
      return (
        `[Context ${i + 1}] ${m.relPath} (lines ${m.startLine}-${m.endLine}, ${m.language})\n` +
        '```' + (m.language || '') + '\n' + m.text + '\n```'
      );
    })
    .join('\n\n');

  let hintBlock = '';
  if (symbolHints.length) {
    const lines = symbolHints
      .slice(0, 10)
      .map((s) => `- ${s.name} (${s.kind}) defined in ${s.relPath}:${s.line}`)
      .join('\n');
    hintBlock = `Relevant symbols found in the code graph:\n${lines}\n\n`;
  }

  return `${hintBlock}${blocks}\n\n---\nQuestion: ${question}`;
}

/**
 * Answer a question about the currently-ingested codebase.
 * @param {string} question
 * @param {{ topK?: number }} [opts]
 */
export async function answerQuestion(question, opts = {}) {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new ApiError(400, '`question` is required.');
  }
  if (!appState.codebase) {
    throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');
  }

  const topK = opts.topK || config.retrieval.topK;
  const keywords = keywordsOf(question);

  // 1. Embed the question into the same vector space as the chunks.
  const queryVector = await embedQuery(question);

  // 2. Retrieve candidates (in-memory or pgvector, depending on the driver). Over-fetch when
  //    hybrid so re-ranking has room to work.
  const overFetch = config.retrieval.hybrid ? topK * 4 : topK;
  let results = await appState.chunkIndex.search(queryVector, overFetch);

  // 3. Hybrid re-rank: blend semantic score with keyword/path overlap.
  if (config.retrieval.hybrid) {
    results = results
      .map((r) => ({ ...r, score: r.score + keywordBonus(r.metadata, keywords) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // 4. Structural lookup: find symbols whose names match the question's keywords.
  const symbolHints = [];
  const seen = new Set();
  for (const kw of keywords) {
    for (const s of await findSymbol(kw, { limit: 5 })) {
      const key = `${s.name}@${s.relPath}:${s.line}`;
      if (!seen.has(key)) {
        seen.add(key);
        symbolHints.push(s);
      }
    }
  }

  // 5. Build a grounded prompt and ask the LLM.
  const prompt = buildPrompt(question, results, symbolHints);
  const { text, model } = await complete({ system: SYSTEM_PROMPT, prompt, context: results });

  // 6. Return the answer plus structured sources + symbol hints for the UI.
  return {
    answer: text,
    model,
    sources: results.map((r) => ({
      relPath: r.metadata.relPath,
      startLine: r.metadata.startLine,
      endLine: r.metadata.endLine,
      language: r.metadata.language,
      score: Number(r.score.toFixed(4)),
      preview: r.metadata.text.slice(0, 240),
    })),
    symbols: symbolHints.slice(0, 10),
  };
}

export default answerQuestion;
