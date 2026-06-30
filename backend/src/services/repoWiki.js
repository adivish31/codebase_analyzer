/**
 * RepoWiki service — "Structure + Curate".
 *
 * Generates a short, structured summary for each file and stores it in the RepoWiki DB. These
 * summaries power a browsable "wiki" of the codebase and give the chat a quick high-level map.
 *
 * Two generation modes:
 *   - deterministic (default / mock): build a summary from extracted symbols + a content preview.
 *     Zero cost, no API calls — every file gets a useful card instantly.
 *   - LLM-curated (optional, WIKI_LLM=true with a real provider): ask the model for a one-paragraph
 *     explanation of each file. Higher quality, costs tokens, so it is capped + opt-in.
 *
 * The pipeline calls generateRepoWiki() after chunking/graphing during ingest.
 */
import { config } from '../config.js';
import { logger } from '../logger.js';
import { appState } from '../state.js';
import { complete } from '../providers/llm/index.js';

/** Build a deterministic summary card from a file's structure. */
function deterministicSummary(doc) {
  const symbolNames = (doc.structuredSymbols || []).map((s) => `${s.name} (${s.kind})`);
  const top = symbolNames.slice(0, 8);
  const preview = doc.content.split('\n').slice(0, 3).join(' ').trim().slice(0, 160);

  const parts = [`${doc.language} file, ${doc.lineCount} lines.`];
  if (top.length) {
    parts.push(`Declares ${symbolNames.length} symbol(s): ${top.join(', ')}${symbolNames.length > top.length ? ', …' : ''}.`);
  } else {
    parts.push('No top-level functions/classes detected.');
  }
  if (preview) parts.push(`Opens with: "${preview}".`);
  return parts.join(' ');
}

/** Ask the LLM for a one-paragraph summary of a file (used only when WIKI_LLM is on). */
async function llmSummary(doc) {
  const snippet = doc.content.slice(0, 2000);
  const prompt =
    `File: ${doc.relPath} (${doc.language})\n\n` +
    '```' + doc.language + '\n' + snippet + '\n```\n\n' +
    'In 2-3 sentences, explain what this file does and its role in the codebase.';
  const { text } = await complete({
    system: 'You are a senior engineer writing concise file-level documentation.',
    prompt,
    context: [],
  });
  return text;
}

/**
 * Generate and persist wiki summaries for the given parsed docs.
 * @param {Array} parsedDocs
 * @returns {Promise<{ count: number, mode: string }>}
 */
export async function generateRepoWiki(parsedDocs) {
  if (!config.wiki.enabled) {
    logger.info('RepoWiki generation disabled (WIKI_ENABLED=false).');
    return { count: 0, mode: 'disabled' };
  }

  const useLlm = config.wiki.useLlm && config.ai.provider !== 'mock';
  const cap = config.wiki.maxFiles;
  const docs = parsedDocs.slice(0, cap);
  let count = 0;

  for (const doc of docs) {
    let summary;
    try {
      summary = useLlm ? await llmSummary(doc) : deterministicSummary(doc);
    } catch (err) {
      logger.warn(`Wiki summary failed for ${doc.relPath}: ${err.message}; using deterministic.`);
      summary = deterministicSummary(doc);
    }
    appState.repoWiki.upsertWiki({
      relPath: doc.relPath,
      language: doc.language,
      summary,
      symbols: doc.symbols || [],
    });
    count++;
  }

  const mode = useLlm ? 'llm' : 'deterministic';
  logger.info(`RepoWiki: generated ${count} file summaries (${mode}).`);
  return { count, mode };
}

export function getWiki(relPath) {
  return appState.repoWiki.getWiki(relPath);
}

export function listWiki() {
  return appState.repoWiki.listWiki();
}

export default generateRepoWiki;
