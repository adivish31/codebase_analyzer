/**
 * Repo ingestion.
 *
 * Turns a "source" (a local folder path OR a GitHub URL) into a flat list of source-code
 * "documents": { path, relPath, ext, content }. This is step 1 of the pipeline; the parser/chunker
 * consume its output.
 *
 * Design notes:
 *  - GitHub URLs are shallow-cloned with `git` into a temp dir (no API token needed for public repos).
 *  - We skip directories and files that add noise or bloat (node_modules, .git, build output,
 *    lockfiles, binaries, oversized files).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { logger } from '../logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

/** Directories we never descend into. */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '.cache', '.turbo', 'vendor', '__pycache__', '.venv', 'venv', '.idea', '.vscode',
]);

/** File extensions we treat as source code worth indexing. */
const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs',
  '.php', '.swift', '.scala', '.sh', '.bash',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.txt',
  '.html', '.css', '.scss', '.vue', '.svelte',
  '.sql', '.graphql', '.proto',
]);

/** Specific filenames to skip even if the extension matches. */
const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', 'Cargo.lock',
]);

const MAX_FILE_BYTES = 200 * 1024; // 200 KB: skip giant generated/minified files

function looksLikeUrl(source) {
  return /^https?:\/\//i.test(source) || /^git@/.test(source);
}

/**
 * Inject a GitHub token into an https GitHub URL for private-repo cloning.
 * Returns the original URL unchanged when no token is set or the host isn't github.com.
 */
function withAuth(url) {
  if (!config.githubToken) return url;
  if (!/^https:\/\/github\.com\//i.test(url)) return url;
  return url.replace(/^https:\/\//i, `https://${config.githubToken}@`);
}

/**
 * Parse `owner` and `repo` out of a github.com URL (https or ssh). Returns null for other hosts —
 * deep-link citations are a GitHub-only feature.
 */
export function parseGitHubUrl(url) {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.\s]+)(?:\.git)?/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** Shallow-clone a git repo (public, or private with GITHUB_TOKEN) into a temp dir. */
async function cloneRepo(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cka-'));
  logger.info(`Cloning ${url} -> ${dir}`); // log the ORIGINAL url, never the tokenized one
  try {
    await execFileAsync('git', ['clone', '--depth', '1', withAuth(url), dir], { timeout: 120000 });
  } catch (err) {
    // Strip any token that may appear in git's error output before surfacing it.
    const safe = err.message.split('\n')[0].replace(/https:\/\/[^@\s]+@/g, 'https://');
    throw new ApiError(400, `Failed to clone repository: ${safe}`);
  }

  // Record the exact commit we indexed so citations can deep-link to
  // github.com/{owner}/{repo}/blob/{sha}/{path}#L{line} — immune to later pushes.
  let sha = null;
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD'], { timeout: 10000 });
    sha = stdout.trim();
  } catch {
    /* citations fall back to non-linked chips */
  }

  return { dir, isTemp: true, sha };
}

/** Heuristic: a NULL (char code 0) byte means the file is binary, not source text. */
function isBinary(content) {
  const limit = Math.min(content.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (content.charCodeAt(i) === 0) return true;
  }
  return false;
}

/** Recursively collect source files under `root`. */
function walk(root, dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    logger.warn(`Cannot read dir ${dir}: ${err.message}`);
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(root, full, out);
    } else if (entry.isFile()) {
      if (IGNORED_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) continue;

      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        logger.debug(`Skipping large file (${stat.size}B): ${full}`);
        continue;
      }

      let content;
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch {
        continue; // unreadable
      }
      if (isBinary(content)) continue;

      out.push({
        path: full,
        relPath: path.relative(root, full).split(path.sep).join('/'),
        ext,
        content,
      });
    }
  }
}

/**
 * Ingest a source into a list of documents.
 * @param {string} source - local folder path or GitHub URL
 * @returns {Promise<{ documents: Array, meta: object }>}
 */
export async function ingestSource(source) {
  if (!source || typeof source !== 'string') {
    throw new ApiError(400, '`source` (a folder path or GitHub URL) is required.');
  }

  let root = source;
  let cleanup = null;
  let github = null;

  if (looksLikeUrl(source)) {
    const { dir, sha } = await cloneRepo(source);
    root = dir;
    cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
    const parsed = parseGitHubUrl(source);
    if (parsed && sha) github = { ...parsed, sha };
  } else {
    // Local paths read the server's own filesystem — disabled on hosted instances
    // (ALLOW_LOCAL_INGEST=false, the production default). Git URLs are always fine.
    if (!config.security.allowLocalIngest) {
      throw new ApiError(403, 'Local path ingestion is disabled on this server. Provide a git URL instead.');
    }
    root = path.resolve(source);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new ApiError(400, `Path does not exist or is not a directory: ${root}`);
    }
  }

  const documents = [];
  try {
    walk(root, root, documents);
  } finally {
    // We read all file contents into memory during walk, so the clone can be removed now.
    if (cleanup) cleanup();
  }

  if (documents.length === 0) {
    throw new ApiError(422, 'No source files found to index in the given source.');
  }

  logger.info(`Ingested ${documents.length} files from ${source}`);
  return {
    documents,
    meta: {
      source,
      fileCount: documents.length,
      ingestedAt: new Date().toISOString(),
      // { owner, repo, sha } for GitHub sources — powers deep-linked citations. Null otherwise.
      github,
    },
  };
}

export default ingestSource;
