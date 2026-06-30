/**
 * Central configuration loader.
 *
 * Reads from environment variables (loaded from `.env` via dotenv) and exposes a single, typed
 * config object. Centralising config here means the rest of the code never touches `process.env`
 * directly — easier to test, document, and change.
 */
import dotenv from 'dotenv';

dotenv.config();

/** Parse an int env var with a fallback. */
function int(name, fallback) {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse a comma-separated list env var. */
function list(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Parse a boolean env var ("true"/"1"/"yes" → true). */
function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return /^(true|1|yes|on)$/i.test(raw.trim());
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int('PORT', 4000),
  corsOrigins: list('CORS_ORIGINS', ['http://localhost:3000']),

  ai: {
    // "mock" | "openai" | "anthropic". Defaults to mock so the app runs with zero keys.
    provider: process.env.AI_PROVIDER || 'mock',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  },

  // Optional token for cloning PRIVATE GitHub repos (public repos need nothing).
  githubToken: process.env.GITHUB_TOKEN || '',

  // Persistence: when true, the RepoWiki/CodeGraph SQLite DBs are written to dataDir and the
  // index reloads on restart. When false, everything lives in in-memory SQLite.
  persist: bool('PERSIST', true),
  dataDir: process.env.DATA_DIR || './data',

  embedding: {
    dim: int('EMBEDDING_DIM', 256),
  },

  chunking: {
    size: int('CHUNK_SIZE', 1200),
    overlap: int('CHUNK_OVERLAP', 200),
  },

  retrieval: {
    topK: int('TOP_K', 5),
    // Hybrid retrieval: boost chunks whose file path / symbols match question keywords.
    hybrid: bool('HYBRID_RETRIEVAL', true),
  },

  wiki: {
    enabled: bool('WIKI_ENABLED', true),
    // Use the LLM to write summaries (needs a real provider). Off by default to avoid token cost.
    useLlm: bool('WIKI_LLM', false),
    maxFiles: int('WIKI_MAX_FILES', 300),
  },

  graph: {
    maxNodes: int('GRAPH_MAX_NODES', 300),
  },
};

export default config;
