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
    // "mock" | "openai" | "anthropic" | "gemini" | "groq". Defaults to mock (zero keys needed).
    provider: process.env.AI_PROVIDER || 'mock',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    // llama-3.3-70b-versatile | moonshotai/kimi-k2-instruct-0905 | openai/gpt-oss-120b
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },

  // Optional token for cloning PRIVATE GitHub repos (public repos need nothing).
  githubToken: process.env.GITHUB_TOKEN || '',

  // Persistence: when true, the RepoWiki/CodeGraph DBs survive restarts and the index reloads on
  // startup. Driver: Postgres when DATABASE_URL is set, otherwise SQLite files under dataDir.
  // When false, everything lives in in-memory SQLite.
  persist: bool('PERSIST', true),
  dataDir: process.env.DATA_DIR || './data',
  databaseUrl: process.env.DATABASE_URL || '',

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

  security: {
    // Set true when running behind a reverse proxy / load balancer so rate limiting sees the
    // real client IP (X-Forwarded-For) instead of the proxy's.
    trustProxy: bool('TRUST_PROXY', false),
    // Ingesting a local folder path reads the server's own filesystem — fine on a dev machine,
    // dangerous on a hosted instance. Defaults off in production; override explicitly if needed.
    allowLocalIngest: bool('ALLOW_LOCAL_INGEST', (process.env.NODE_ENV || 'development') !== 'production'),
    // Rate limits (per client IP): asks per minute, ingests per 10 minutes.
    askRateLimit: int('ASK_RATE_LIMIT', 30),
    ingestRateLimit: int('INGEST_RATE_LIMIT', 5),
  },
};

export default config;
