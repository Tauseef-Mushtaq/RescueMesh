/**
 * Incident Knowledge Evidence Selection (M14-D).
 *
 * The bridge between:
 *   M14-C (`retrieveIncidentKnowledge` — builds a query, calls the
 *   existing, unmodified `retrieveRelevantChunks` from `lib/rag/retrieval
 *   .ts`)
 * and:
 *   M14-E (grounded Gemini generation, not implemented here).
 *
 * This module does NOT call Gemini, does NOT re-embed anything, does NOT
 * call Supabase directly, and does NOT reimplement any part of the M12
 * retrieval pipeline. It only shapes the *already-retrieved, already-
 * ranked* `RetrievedChunk[]` from M12 into the smaller, cleaner
 * `IncidentKnowledgeEvidence` structure M14-E needs, while preserving:
 *
 *   - the existing ok/empty/error three-way retrieval outcome exactly
 *     (see `lib/rag/retrieval.ts`'s `RetrievalResult` and
 *     HANDOFF_M14C.md's "Retrieval behavior" section) — never converts
 *     an infrastructure failure into a "no knowledge" state, and never
 *     converts a successful empty search into an error;
 *   - source provenance (title / slug / category) exactly as the M12
 *     retrieval layer already produced it — no invented URL, author,
 *     publication date, agency, confidence, or similarity score (see
 *     AGENTS.md's "never fabricate a source or citation" rule and
 *     HANDOFF_M14A.md's note that `RetrievedChunk` only ever carries
 *     title/slug/category metadata);
 *   - the M12 similarity ranking order (chunks are not re-sorted,
 *     re-scored, or given a second "AI confidence" number here).
 *
 * PROMPT-INJECTION BOUNDARY (see HANDOFF_M14C.md and the M14-D module
 * prompt, section 20): retrieved knowledge `content` is treated purely
 * as data here — copied verbatim from `RetrievedChunk.content`, never
 * parsed, evaluated, summarized, or folded into any instruction string.
 * The M14-E generation prompt (not implemented here) is responsible for
 * establishing the actual system-instruction/evidence-data boundary when
 * it eventually sends this evidence to Gemini.
 */
import type { KnowledgeCategory } from "@/lib/supabase/types";
import type { RetrievalResult, RetrievedChunk } from "@/lib/rag/retrieval";
import {
  retrieveIncidentKnowledge,
  type IncidentContextInput,
} from "@/lib/incidents/intelligence-context";
import { retrieveRelevantChunks } from "@/lib/rag/retrieval";

/**
 * A single piece of evidence ready for M14-E's generation prompt.
 *
 * Deliberately smaller than `RetrievedChunk`: drops `id`, `sourceId`,
 * `chunkIndex`, `similarity`, `documentId`, and `language` — none of
 * those are needed to ground a Gemini answer, and exposing them would
 * leak internal database identifiers / an unused ranking number into a
 * layer that has no business displaying or reasoning about them (see
 * module prompt section 6: "do not expose unnecessary internal database
 * metadata to generation" and section 8: "do not automatically expose
 * similarity scores"). `content` is kept as the *actual* verified
 * knowledge text (not just title/slug) — per module prompt section 6,
 * M14-E needs real grounding content, not just a citation label.
 */
export interface IncidentKnowledgeEvidence {
  title: string | null;
  slug: string | null;
  category: KnowledgeCategory | null;
  content: string;
}

/**
 * Mirrors `RetrievalResult`'s ok/error shape exactly (same two reason
 * enums, same `message` field) so a retrieval failure stays a failure —
 * with its original reason intact — all the way through to whatever
 * M14-E/F does with it, rather than being re-interpreted or losing
 * information at this layer.
 */
export type IncidentEvidenceResult =
  | { ok: true; evidence: IncidentKnowledgeEvidence[] }
  | {
      ok: false;
      reason: "missing_api_key" | "provider_error" | "database_error";
      message: string;
    };

/** `RetrievedChunk` -> `IncidentKnowledgeEvidence`. A direct field
 * projection — no transformation of `title`/`slug`/`category`, and
 * `content` is copied verbatim (not paraphrased, summarized, or
 * modified in any way — see the module's "content handling" doc above
 * and section 14 of the module prompt). */
function toEvidence(chunk: RetrievedChunk): IncidentKnowledgeEvidence {
  return {
    title: chunk.title,
    slug: chunk.slug,
    category: chunk.category,
    content: chunk.content,
  };
}

/**
 * Defensive de-duplication by chunk `id` only — NOT by source document.
 *
 * This is deliberately narrow. Per module prompt section 16: multiple
 * legitimate chunks from the *same* source document (different
 * `chunkIndex`, different `content`) are real, distinct evidence and
 * must be preserved — the M11/M12 pipeline can and does return several
 * chunks from one authoritative document, and each may contain guidance
 * the others don't. What this guards against instead is the same exact
 * chunk row appearing twice in one retrieval result (e.g. a defensive
 * safety net against an unexpected RPC/query quirk, not an expected
 * occurrence) — since `id` uniquely identifies one chunk row, two
 * entries sharing an `id` are the literal same evidence counted twice,
 * which would be a no-reason duplicate rather than an intentional
 * additional citation.
 */
function dedupeById(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const result: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    result.push(chunk);
  }
  return result;
}

/**
 * Converts an existing `RetrievalResult` (from `retrieveRelevantChunks`
 * / `retrieveIncidentKnowledge`, unmodified) into the M14 evidence
 * contract.
 *
 * Content bound: NONE is added here, by design. Each `RetrievedChunk
 * .content` is already bounded by M12's chunking (`MAX_CHUNK_WORDS =
 * 320` in `lib/rag/chunking.ts`, ~2,200 characters), and the number of
 * chunks is already bounded by `retrieveRelevantChunks`'s `topK`
 * (default 5, hard max 20 — see `lib/rag/retrieval.ts`). Per module
 * prompt section 15's stated preference order ("1. existing chunk
 * boundaries, 2. existing top-K limit... do not invent an arbitrary
 * truncation number merely for the sake of having one"), those two
 * existing, already-verified bounds are relied on directly rather than
 * adding a third, redundant character-count truncation here. See Test 9
 * in the test file for the explicit assertion that evidence length
 * always equals retrieved-chunk length (i.e. this function performs no
 * additional truncation of the evidence list or of any individual
 * chunk's content).
 *
 * Ordering: preserved exactly as returned by the M12 retrieval RPC
 * (similarity-ranked, descending) — chunks are not re-sorted or
 * re-scored here.
 */
export function selectIncidentKnowledge(
  retrieval: RetrievalResult,
): IncidentEvidenceResult {
  if (!retrieval.ok) {
    // Infrastructure failure stays a failure, with its original reason —
    // never silently downgraded to "no knowledge found" (module prompt
    // section 12).
    return {
      ok: false,
      reason: retrieval.reason,
      message: retrieval.message,
    };
  }

  // A successful search with zero chunks stays a successful, empty
  // evidence set — not an error, and no fallback/invented content is
  // ever substituted (module prompt sections 12-13).
  const evidence = dedupeById(retrieval.data).map(toEvidence);
  return { ok: true, evidence };
}

/**
 * Convenience one-call entry point for M14-E: builds the incident's
 * retrieval context and runs retrieval via the existing, unmodified
 * M14-C `retrieveIncidentKnowledge` (which itself calls the existing,
 * unmodified M12 `retrieveRelevantChunks`), then selects evidence from
 * the result. Does not duplicate M14-C's query-building or retrieval
 * logic — this is purely `retrieveIncidentKnowledge` +
 * `selectIncidentKnowledge` composed together so callers don't need to
 * wire the two modules together themselves.
 *
 * `retrieveFn` is forwarded to `retrieveIncidentKnowledge` unchanged
 * (same injection point M14-C already exposes for offline testing —
 * defaults to the real `retrieveRelevantChunks`).
 */
export async function buildIncidentEvidence(
  incident: IncidentContextInput,
  retrieveFn: typeof retrieveRelevantChunks = retrieveRelevantChunks,
): Promise<IncidentEvidenceResult> {
  const { retrieval } = await retrieveIncidentKnowledge(incident, retrieveFn);
  return selectIncidentKnowledge(retrieval);
}
