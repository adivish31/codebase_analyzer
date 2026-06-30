# 04 — CodeGraph, RepoWiki & Persistence

How the two SQLite databases work, why they exist, and how they integrate with the RAG pipeline.
This is the layer that turns the project from "RAG over chunks" into "a system that understands
relationships between files" (the vision in the project pitch).

---

## The two databases

The system maintains two SQLite databases (built on Node's dependency-free `node:sqlite`):

### RepoWiki DB (`repowiki.db`) — "Structure + Curate"
Persists everything needed to restore the search index and browse the codebase:

| Table | Contents |
|-------|----------|
| `meta` | One row describing the indexed codebase (source, counts, timestamps) |
| `files` | Per-file language + line count |
| `chunks` | Every retrievable chunk **with its embedding vector** (vector stored as JSON) |
| `wiki` | Per-file curated summary cards |

### CodeGraph DB (`codegraph.db`) — "Building Relationships"
Stores the structural graph, queried directly (not via embeddings):

| Table | Contents |
|-------|----------|
| `files` | Graph nodes (one per file) |
| `symbols` | Declared functions/classes/methods with `kind` + `line` |
| `edges` | File → file import relationships |

---

## Why two databases, not one?

They serve different access patterns and map cleanly to the two pipeline stages in the design:

- **RepoWiki** is read sequentially (load all chunks on startup) and supports the semantic path.
- **CodeGraph** is queried by index (symbol name, file path) and supports the structural path.

Splitting them keeps each schema focused and matches the "Syntax Parsing → CodeGraph DB" and
"Structure + Curate → RepoWiki DB" split in the architecture diagram. They could be one file with
more tables; two files is a clarity choice, not a hard requirement.

---

## Persistence model

```
PERSIST=true   →  DBs are files in DATA_DIR; on startup the server reloads the vector index
                  from repowiki.db (no re-ingest needed).
PERSIST=false  →  DBs use SQLite ':memory:' — identical code path, nothing survives a restart.
```

The elegance: **the same code runs in both modes.** `:memory:` databases mean there is no separate
"in-memory vs persistent" branch in the application logic — only the file path differs.

### Startup reload sequence (`state.js → initState`)
1. Open both SQLite DBs (file or `:memory:`).
2. If persisting and `meta` exists: read all `chunks`, rehydrate each into the in-memory
   `VectorStore`, and restore `appState.codebase`.
3. Serve requests immediately — the last-indexed repo is already searchable.

This is why a server restart logs `Reloaded persisted index: N chunks from M files` and answers
questions without re-ingesting.

---

## Why vectors live in SQLite but search stays in memory

SQLite (without the `sqlite-vec` extension) can't do fast vector similarity search. So:

- **Storage:** vectors are persisted as JSON text in `chunks.vector` — durable across restarts.
- **Search:** on startup they're loaded into the in-memory `VectorStore` for brute-force cosine
  search (O(n·d), fine for thousands of chunks).

This gives persistence *and* fast search without an external vector DB. The upgrade path
(pgvector / Qdrant) is documented in `docs/interview-prep/06-production-hardening.md`.

---

## Building the graph (the "relationships" step)

`services/codeGraph.js → buildCodeGraph(parsedDocs)` runs during ingest:

1. **Nodes:** one `files` row per document.
2. **Symbols:** the parser's `structuredSymbols` (`{ name, kind, line }`) become `symbols` rows.
3. **Edges:** `services/imports.js` extracts import specifiers per file; relative imports are
   resolved against the importing file's path to a real indexed file → an `edges` row.

Import resolution tries common extensions and index files (`./foo` → `foo.js`, `foo/index.ts`,
`foo/__init__.py`, …), so the graph captures real internal dependencies across JS/TS/Python.

---

## Hybrid retrieval — how the graph improves answers

`services/rag.js` blends two signals so questions like *"Where is the payment logic?"* land on the
right file even when wording differs from the code:

1. **Semantic:** embed the question, over-fetch `TOP_K × 4` candidate chunks by cosine similarity.
2. **Lexical re-rank:** boost candidates whose **file path** (strong) or **text** (weak) contains
   the question's keywords. Capped so lexical never fully overrides semantic.
3. **Structural hints:** look up question keywords in the CodeGraph `symbols` table and attach
   "symbol X (function) defined in path:line" hints to the prompt and the response.

The result: answers cite both the relevant code chunks **and** the exact symbols/locations.

---

## Request flow with the new components

```
POST /api/ingest
  ingest → parse (symbols) → reset(both DBs)
         → buildCodeGraph → chunk → embed
         → vectorStore.add + repoWiki.insertChunks + insertFiles
         → generateRepoWiki → saveMeta
GET  /api/symbols?name=X     → codegraph.db: symbols WHERE name LIKE X
GET  /api/graph              → codegraph.db: files + edges
GET  /api/file?relPath=Y     → symbolsIn + dependenciesOf + dependentsOf + wiki
GET  /api/wiki               → repowiki.db: all wiki rows
POST /api/ask                → hybrid retrieval (vectors + symbols) → LLM
```

---

## Interview Q&A

**Q: Why SQLite instead of Postgres or a vector DB?**
SQLite via `node:sqlite` is zero-dependency, embedded, and perfect for a single-node tool — no
server to run. It gives durability and indexed structural queries for free. For multi-node scale
you'd move chunks to pgvector and the graph to Postgres (or a real graph DB like Neo4j), keeping
the same service interfaces.

**Q: How do you keep the vector index and SQLite in sync?**
They're written together in one ingest transaction-ish flow: every chunk is added to the in-memory
store and inserted into `chunks` in the same loop. On restart, the in-memory store is rebuilt
from `chunks`, so SQLite is the source of truth.

**Q: Why store vectors as JSON instead of a blob?**
Simplicity and portability — JSON is human-inspectable and trivially parsed back to a float array.
For large indexes you'd store a packed Float32 binary blob (4 bytes/dim) to cut storage ~3× and
parse faster, or use `sqlite-vec` for in-DB similarity search.

**Q: What does the code graph add over pure RAG?**
Precision on structural questions. "Where is X defined?" or "what imports Y?" are exact lookups,
not fuzzy semantic matches. Combined with RAG (hybrid retrieval), you get both meaning-based and
structure-based answers.
