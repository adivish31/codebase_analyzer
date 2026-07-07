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
import { complete, completeStream } from '../providers/llm/index.js';
import { getCached, setCached } from './queryCache.js';

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

/**
 * Light stemming so morphology doesn't break path matching: "cached" should still hit
 * queryCache.js, "embedded" should hit embeddings/. Trims common suffixes down to a stem.
 */
function stem(word) {
  return word.replace(/(ing|ed|es|s)$/, '');
}

/** Keyword bonus for one candidate: matches in the path weigh more than matches in the body. */
function keywordBonus(meta, keywords) {
  if (keywords.length === 0) return 0;
  const path = meta.relPath.toLowerCase();
  const text = meta.text.toLowerCase();
  let bonus = 0;
  for (const kw of keywords) {
    const st = stem(kw);
    if (path.includes(kw) || (st.length > 3 && path.includes(st))) bonus += 0.15; // filename/dir matches the topic
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
 * Retrieval phase, shared by the blocking and streaming answer paths:
 * embed → over-fetch → hybrid re-rank → symbol lookup → prompt.
 */
async function retrieveContext(question, topK) {
  const keywords = keywordsOf(question);

  // 1. Embed the question into the same vector space as the chunks.
  const queryVector = await embedQuery(question);

  // 2. Retrieve candidates (in-memory or pgvector, depending on the driver). Over-fetch when
  //    hybrid so re-ranking has room to work — 8× measured better than 4× on the golden set
  //    (path-boosted chunks often sit just past the top-20).
  const overFetch = config.retrieval.hybrid ? topK * 8 : topK;
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

  return {
    results,
    symbolHints: symbolHints.slice(0, 10),
    prompt: buildPrompt(question, results, symbolHints),
  };
}

function validateAsk(question) {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new ApiError(400, '`question` is required.');
  }
  // codebase meta is the indexed-ness signal — with pgvector the chunks live only in the DB,
  // so there is no in-memory size to check.
  if (!appState.codebase) {
    throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');
  }
}

/** Shape the response payload (also what gets cached). */
function toPayload(text, model, results, symbolHints) {
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
    symbols: symbolHints,
  };
}

/**
 * Answer a question about the currently-ingested codebase (blocking).
 * @param {string} question
 * @param {{ topK?: number }} [opts]
 */
export async function answerQuestion(question, opts = {}) {
  validateAsk(question);
  const topK = opts.topK || config.retrieval.topK;
  const indexVersion = appState.codebase.ingestedAt;

  const cached = getCached(question, topK, indexVersion);
  if (cached) return { ...cached, cached: true };

  const { results, symbolHints, prompt } = await retrieveContext(question, topK);
  const { text, model } = await complete({ system: SYSTEM_PROMPT, prompt, context: results });

  const payload = toPayload(text, model, results, symbolHints);
  setCached(question, topK, indexVersion, payload);
  return payload;
}

/**
 * Streaming variant. Emits, in order:
 *   onSources({ sources, symbols })  — citations arrive BEFORE the answer starts
 *   onToken(delta)                   — per streamed text delta
 * Resolves with the same payload shape as answerQuestion. Cache hits replay instantly.
 */
export async function answerQuestionStream(question, opts = {}, { onSources, onToken }) {
  validateAsk(question);
  const topK = opts.topK || config.retrieval.topK;
  const indexVersion = appState.codebase.ingestedAt;

  const cached = getCached(question, topK, indexVersion);
  if (cached) {
    onSources?.({ sources: cached.sources, symbols: cached.symbols });
    onToken?.(cached.answer);
    return { ...cached, cached: true };
  }

  const { results, symbolHints, prompt } = await retrieveContext(question, topK);
  onSources?.({
    sources: toPayload('', '', results, symbolHints).sources,
    symbols: symbolHints,
  });

  const { text, model } = await completeStream({
    system: SYSTEM_PROMPT,
    prompt,
    context: results,
    onToken,
  });

  const payload = toPayload(text, model, results, symbolHints);
  setCached(question, topK, indexVersion, payload);
  return payload;
}

export default answerQuestion;
