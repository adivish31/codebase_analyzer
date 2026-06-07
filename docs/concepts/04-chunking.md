# 04 — Chunking strategies

## Why chunk at all

Two hard limits force us to split files:

1. **Embedding/model input size** — you can't embed a 2,000-line file as one vector meaningfully;
   detail gets averaged away.
2. **Retrieval granularity** — you want to return the *relevant function*, not a whole file. Small,
   coherent units give precise, citable answers.

So each file is split into **chunks**, and chunks (not files) are the unit we embed, store, and
retrieve.

## The strategy in this project

`services/chunker.js` does **line-aware sliding-window chunking with overlap**:

- Accumulate lines until the buffer reaches ~`CHUNK_SIZE` characters (default 1200).
- Emit a chunk, recording `startLine`/`endLine` so answers can cite exact locations.
- Start the next chunk with an **overlap** tail of ~`CHUNK_OVERLAP` characters (default 200) from
  the end of the previous chunk.

```
File lines:  1 .......... 40 .......... 80 .......... 120
Chunk A:     [1 ........... 42]
Chunk B:                 [38 ........... 82]      ← overlaps A by ~200 chars
Chunk C:                              [78 ........ 120]
```

## Why overlap matters

Without overlap, a function or explanation that straddles a chunk boundary gets cut in half, and
neither chunk is individually retrievable for it. Overlap guarantees any local concept appears
*whole* in at least one chunk. The cost is mild redundancy (some text indexed twice).

## Why line-aware (not raw character slicing)

Splitting on character count alone can cut mid-line, mangling code. Splitting on line boundaries
keeps lines intact and lets us track line numbers for citations (`relPath:startLine-endLine`).

## Tuning the knobs

- **Chunk size** — smaller = more precise retrieval but more chunks and more boundary-crossing;
  larger = more context per chunk but coarser hits and bigger prompts.
- **Overlap** — more overlap = safer boundaries but more duplication/cost. ~10–20% of chunk size is
  a common rule of thumb (200/1200 ≈ 17% here).

## More advanced strategies (the upgrade path)

- **Syntax-aware chunking** — split on function/class boundaries using an AST (tree-sitter) so each
  chunk is a semantically complete unit. Best for code.
- **Recursive/hierarchical chunking** — split on large structures first, then sub-split.
- **Semantic chunking** — group sentences/blocks by embedding similarity.

Our line-window approach is the language-agnostic, dependency-free baseline; syntax-aware is the
natural next step (noted in design-decisions doc 6).

## Interview Q&A

**Q: Why do you chunk documents before embedding?**
To respect model input limits and to make retrieval granular — return the relevant snippet, not a
whole file — which improves precision and enables citations.

**Q: Why overlap chunks?**
So a concept spanning a boundary still appears intact in at least one chunk; otherwise it's split and
poorly retrievable. Trade-off is some duplicated text.

**Q: How do you pick chunk size?**
Balance precision vs context: smaller chunks retrieve more precisely but fragment concepts and cost
more entries; tune empirically against your model's limits and your eval set.

**Q: What's better than fixed-size chunking for code?**
Syntax-aware chunking on function/class boundaries via an AST, so chunks are coherent units.
