/**
 * RAG engine — Retrieval-Augmented Generation.
 *
 * The core idea: don't ask the LLM to recall the codebase from memory (it can't — it never saw it).
 * Instead RETRIEVE the most relevant code chunks from our vector index, stuff them into the prompt
 * as context, and ask the LLM to answer USING ONLY that context. This grounds answers in real code
 * and lets us cite exact files/lines.
 *
 * Flow:  question -> embed -> vector search (top-K) -> build prompt -> LLM -> answer + sources
 *
 * See docs/concepts/01-rag.md for the full explanation.
 */
import { config } from '../config.js';
import { ApiError } from '../middleware/errorHandler.js';
import { appState } from '../state.js';
import { embedQuery } from './embeddings/index.js';
import { complete } from '../providers/llm/index.js';

const SYSTEM_PROMPT =
  'You are a senior engineer explaining a codebase. Answer the question using ONLY the provided ' +
  'code context. Cite files by their path. If the context is insufficient, say so plainly.';

/** Assemble the user prompt: context blocks + the question. */
function buildPrompt(question, results) {
  const blocks = results
    .map((r, i) => {
      const m = r.metadata;
      return (
        `[Context ${i + 1}] ${m.relPath} (lines ${m.startLine}-${m.endLine}, ${m.language})\n` +
        '```' + (m.language || '') + '\n' + m.text + '\n```'
      );
    })
    .join('\n\n');

  return `${blocks}\n\n---\nQuestion: ${question}`;
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
  if (!appState.codebase || appState.vectorStore.size === 0) {
    throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');
  }

  const topK = opts.topK || config.retrieval.topK;

  // 1. Embed the question into the same vector space as the chunks.
  const queryVector = await embedQuery(question);

  // 2. Retrieve the most similar chunks.
  const results = appState.vectorStore.search(queryVector, topK);

  // 3. Build a grounded prompt and ask the LLM.
  const prompt = buildPrompt(question, results);
  const { text, model } = await complete({
    system: SYSTEM_PROMPT,
    prompt,
    context: results,
  });

  // 4. Return the answer plus structured sources for the UI to render/cite.
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
  };
}

export default answerQuestion;
