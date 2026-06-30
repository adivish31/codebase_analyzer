/**
 * CodeGraph routes — structural queries answered directly from the CodeGraph DB.
 *
 *   GET /api/graph            → { nodes, edges, counts }   (for visualization)
 *   GET /api/symbols?name=X   → where a symbol is defined  ("Where is X defined?")
 *   GET /api/file?relPath=Y   → one file's symbols, dependencies, dependents, and wiki card
 */
import { Router } from 'express';

import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../middleware/errorHandler.js';
import { appState } from '../state.js';
import { config } from '../config.js';
import { findSymbol, getGraph, dependenciesOf, dependentsOf, symbolsIn } from '../services/codeGraph.js';
import { getWiki } from '../services/repoWiki.js';

const router = Router();

function ensureIndexed() {
  if (!appState.codebase || appState.vectorStore.size === 0) {
    throw new ApiError(409, 'No codebase indexed yet. POST /api/ingest first.');
  }
}

/** Full (capped) dependency graph for rendering. */
router.get(
  '/graph',
  asyncHandler(async (req, res) => {
    ensureIndexed();
    const limit = Number.parseInt(req.query.limit, 10) || config.graph.maxNodes;
    const { nodes, edges } = getGraph(limit);
    res.json({ nodes, edges, counts: appState.codeGraph.counts() });
  })
);

/** Symbol lookup — "Where is `processPayment` defined?" */
router.get(
  '/symbols',
  asyncHandler(async (req, res) => {
    ensureIndexed();
    const name = (req.query.name || '').trim();
    if (!name) throw new ApiError(400, 'Provide `name` query param, e.g. /api/symbols?name=processPayment');
    const exact = req.query.exact === 'true';
    const matches = findSymbol(name, { exact });
    res.json({ query: name, exact, count: matches.length, matches });
  })
);

/** Single-file detail: symbols, dependencies, dependents, and wiki summary. */
router.get(
  '/file',
  asyncHandler(async (req, res) => {
    ensureIndexed();
    const relPath = (req.query.relPath || '').trim();
    if (!relPath) throw new ApiError(400, 'Provide `relPath` query param.');
    res.json({
      relPath,
      symbols: symbolsIn(relPath),
      dependencies: dependenciesOf(relPath),
      dependents: dependentsOf(relPath),
      wiki: getWiki(relPath),
    });
  })
);

export default router;
