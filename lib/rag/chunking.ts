/**
 * Deterministic Chunking (M12)
 *
 * Pure, side-effect-free, word-count-based chunking. No AI, no
 * tokenizer dependency (the project has none installed and this is a
 * hackathon MVP — see the M12 module prompt's "do not over-engineer a
 * tokenizer" guidance). Word counts are used as a stable proxy for
 * token counts (roughly 0.75 words per token for English prose, so
 * ~260 words ≈ ~350 tokens) — approximate, but deterministic and good
 * enough to keep chunks in a sane size band for retrieval.
 *
 * Same input always produces the same chunks — required for the
 * ingestion pipeline's idempotency (a chunk's index and content only
 * change if the source document's content actually changed).
 */

/** Target chunk size, in words (~ the low end of the ~500-1000 token
 * guidance from the M12 module prompt, since the M11 knowledge_documents
 * corpus is short curated articles, not long-form documents). */
export const TARGET_CHUNK_WORDS = 220;

/** Hard ceiling before a chunk (or an oversized paragraph) is split
 * further, even mid-paragraph. */
export const MAX_CHUNK_WORDS = 320;

/** Overlap carried from the end of one chunk into the start of the
 * next, so retrieval doesn't lose context at a chunk boundary. */
export const OVERLAP_WORDS = 40;

/** Chunks below this size are merged into the previous chunk instead
 * of being kept as their own tiny, low-context fragment. */
export const MIN_CHUNK_WORDS = 30;

export interface TextChunk {
  index: number;
  content: string;
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Splits a single oversized paragraph into ~MAX_CHUNK_WORDS-sized,
 * OVERLAP_WORDS-overlapping word windows. Only used when one paragraph
 * alone exceeds MAX_CHUNK_WORDS. */
function splitLongParagraph(words: string[]): string[] {
  const pieces: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + TARGET_CHUNK_WORDS, words.length);
    pieces.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start = end - OVERLAP_WORDS;
  }
  return pieces;
}

/**
 * Deterministic paragraph-aware chunker: preserves paragraph
 * boundaries where possible, packs paragraphs greedily up to
 * TARGET_CHUNK_WORDS, carries OVERLAP_WORDS of trailing context into
 * the next chunk, and only splits mid-paragraph when a single
 * paragraph alone exceeds MAX_CHUNK_WORDS.
 */
export function chunkText(text: string): TextChunk[] {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const rawChunks: string[] = [];
  let currentWords: string[] = [];

  const flush = () => {
    if (currentWords.length === 0) return;
    rawChunks.push(currentWords.join(" "));
    currentWords = [];
  };

  for (const paragraph of paragraphs) {
    const paragraphWords = splitWords(paragraph);

    if (paragraphWords.length > MAX_CHUNK_WORDS) {
      // Oversized paragraph: flush whatever we were accumulating, then
      // split this paragraph on its own.
      flush();
      for (const piece of splitLongParagraph(paragraphWords)) {
        rawChunks.push(piece);
      }
      continue;
    }

    if (currentWords.length + paragraphWords.length > MAX_CHUNK_WORDS) {
      flush();
      // Carry overlap from the end of the previous chunk into this one.
      const previous = rawChunks[rawChunks.length - 1];
      if (previous) {
        const previousWords = splitWords(previous);
        const overlap = previousWords.slice(
          Math.max(0, previousWords.length - OVERLAP_WORDS)
        );
        currentWords = [...overlap];
      }
    }

    currentWords = [...currentWords, ...paragraphWords];

    if (currentWords.length >= TARGET_CHUNK_WORDS) {
      flush();
    }
  }
  flush();

  // Merge a too-small trailing chunk into the previous one rather than
  // keeping a low-context fragment, unless it's the only chunk.
  if (rawChunks.length > 1) {
    const last = rawChunks[rawChunks.length - 1];
    if (splitWords(last).length < MIN_CHUNK_WORDS) {
      rawChunks[rawChunks.length - 2] =
        `${rawChunks[rawChunks.length - 2]} ${last}`;
      rawChunks.pop();
    }
  }

  return rawChunks.map((content, index) => ({ index, content }));
}
