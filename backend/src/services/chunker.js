/**
 * Chunker.
 *
 * Step 3 of the pipeline. LLMs and embeddings have a bounded input size, and retrieval works best
 * when each indexed unit is a small, coherent slice of code. So we split each file into overlapping
 * "chunks".
 *
 * Strategy: line-aware sliding window.
 *   - We accumulate lines until the chunk reaches ~CHUNK_SIZE characters.
 *   - Consecutive chunks overlap by ~CHUNK_OVERLAP characters so a concept that straddles a
 *     boundary still appears whole in at least one chunk.
 *   - We track start/end line numbers so answers can cite exact locations.
 *
 * See docs/concepts/04-chunking.md for why overlap and size matter.
 */
import { config } from '../config.js';

let counter = 0;
function nextId(relPath, idx) {
  counter += 1;
  return `${relPath}#${idx}-${counter}`;
}

/**
 * Split one parsed document into chunks.
 * @returns {Array<{id, relPath, language, text, startLine, endLine, symbols}>}
 */
export function chunkDocument(doc, opts = {}) {
  const size = opts.size || config.chunking.size;
  const overlap = Math.min(opts.overlap ?? config.chunking.overlap, Math.floor(size / 2));

  const lines = doc.content.split('\n');
  const chunks = [];

  let buf = [];
  let bufChars = 0;
  let startLine = 1;
  let idx = 0;

  const flush = (endLine) => {
    if (buf.length === 0) return;
    const text = buf.join('\n');
    chunks.push({
      id: nextId(doc.relPath, idx++),
      relPath: doc.relPath,
      language: doc.language,
      text,
      startLine,
      endLine,
      symbols: doc.symbols || [],
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    buf.push(line);
    bufChars += line.length + 1;

    if (bufChars >= size) {
      const endLine = i + 1;
      flush(endLine);

      // Build the overlap tail: keep trailing lines until we've re-collected ~overlap chars.
      const tail = [];
      let tailChars = 0;
      for (let j = buf.length - 1; j >= 0 && tailChars < overlap; j--) {
        tail.unshift(buf[j]);
        tailChars += buf[j].length + 1;
      }
      buf = tail;
      bufChars = tailChars;
      startLine = endLine - tail.length + 1;
    }
  }
  // Flush the remainder
  flush(lines.length);

  return chunks;
}

/** Chunk many documents into one flat array. */
export function chunkDocuments(parsedDocs, opts = {}) {
  const all = [];
  for (const doc of parsedDocs) {
    for (const chunk of chunkDocument(doc, opts)) all.push(chunk);
  }
  return all;
}

export default chunkDocuments;
