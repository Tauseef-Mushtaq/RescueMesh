/**
 * Incident Context Builder + Retrieval Integration (M14-C).
 *
 * Deterministic, Gemini-free — same rationale as
 * `lib/incidents/intelligence-category.ts` and `lib/scoring/priority.ts`:
 * pure TypeScript, no network/database dependency in the query-building
 * step itself, safe to unit test in isolation.
 *
 * This module answers exactly one question: "given an existing incident,
 * what is the best concise search query for the existing verified
 * RescueMesh knowledge base?" — and then hands that query to the
 * *existing* `retrieveRelevantChunks` (`lib/rag/retrieval.ts`, M12)
 * unchanged. It does not call Gemini, does not embed anything itself, and
 * does not create a second retrieval implementation.
 *
 * PROMPT-INJECTION BOUNDARY (see HANDOFF_M14A/B and the M14-C module
 * prompt, section 10): `report_text` / `summary` are untrusted reporter
 * input. At this stage that is safe by construction, not by sanitization
 * — the only thing done with this text is folding a bounded excerpt of
 * it into a plain string that is later embedded for vector similarity
 * search (the same trust level `/ask`'s user-typed question already has
 * in M13; embedding has no concept of "instructions" to obey). No LLM
 * ever reads this text as a system/instruction channel in M14-C — that
 * only happens in M14-D/E's *generation* step, which is explicitly out
 * of scope here and must apply its own delimiting when it arrives. This
 * module does not attempt to detect or strip instruction-like phrases
 * (e.g. "ignore previous instructions") because doing so here would be
 * both ineffective (that belongs at the generation-prompt boundary, not
 * the search-query boundary) and over-engineering the deterministic
 * query builder the M14-C prompt explicitly asks this to stay.
 */
import type { IncidentRow, IncidentType, KnowledgeCategory } from "@/lib/supabase/types";
import { mapIncidentTypeToKnowledgeCategory } from "@/lib/incidents/intelligence-category";
import { retrieveRelevantChunks, type RetrievalResult } from "@/lib/rag/retrieval";

/**
 * The subset of `IncidentRow` the context builder actually needs.
 * `Pick`ed from the existing incident model rather than redeclared, per
 * HANDOFF_M14A's "reuse the existing incident model, do not duplicate"
 * finding. Deliberately excludes `id`, `latitude`/`longitude`,
 * `created_at`/`updated_at`, `status`, and `priority_score` — none of
 * those are knowledge-retrieval concepts (see module prompt section 7:
 * "the retrieval query should represent the situation, not the database
 * row").
 */
export type IncidentContextInput = Pick<
  IncidentRow,
  | "incident_type"
  | "summary"
  | "report_text"
  | "medical_emergency"
  | "mobility_impairment"
  | "immediate_danger"
  | "food_shortage"
  | "water_risk"
>;

/** Result of converting an incident into a retrieval query. */
export interface IncidentContext {
  query: string;
  category: KnowledgeCategory | null;
}

/**
 * Maximum length of the reporter-text excerpt folded into the query.
 * Kept well short of a full report — this is a search query, not a
 * transcript. `summary` is expected to already be short (it's an
 * AI-generated one-liner from M05 extraction), but is still bounded here
 * defensively in case a future caller passes a long or unvalidated
 * value.
 */
const MAX_TEXT_EXCERPT_LENGTH = 160;

/**
 * Maximum total length of the composed query, independent of the text
 * excerpt bound above (structured facts + excerpt + closing phrase could
 * otherwise still add up). Deliberately smaller than `/api/rag`'s
 * `MAX_QUERY_LENGTH` (500, in `lib/rag/client-response.ts`) — that limit
 * governs a user-typed question in a different feature; M14's
 * auto-composed query should stay concise per the module prompt's "do
 * not make the query unnecessarily long."
 */
const MAX_QUERY_LENGTH = 300;

/** Collapses all whitespace (including newlines) to single spaces and
 * trims. Reporter text may contain arbitrary formatting; a retrieval
 * query should not. */
function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Bounded, defensive excerpt of untrusted reporter text. Truncates by
 * character count after normalization — simple and predictable, matching
 * the module prompt's "do not over-engineer semantics" instruction (no
 * sentence-boundary detection, no summarization). */
function boundedExcerpt(value: string | null, maxLength: number): string {
  if (!value) return "";
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trim();
}

/** `"building_collapse"` -> `"building collapse"`. Turns the raw
 * `IncidentType` value into a natural-language phrase for the query,
 * without inventing a separate label table (`INCIDENT_TYPE_LABELS` in
 * `app/incidents/[id]/page.tsx` is display copy for the UI, e.g. "Missing
 * Person" — a different concern, not reused here). */
function incidentTypeQueryTerm(incidentType: IncidentType | null): string {
  if (!incidentType || incidentType === "other") return "";
  return incidentType.replace(/_/g, " ");
}

/**
 * The active boolean critical-indicator phrases for this incident, in a
 * fixed, deterministic order. `children_count` / `elderly_count` are
 * intentionally excluded — they are counts, not booleans, and the module
 * prompt's "critical indicators" test scope (section 17, Test 4) is
 * specifically about the boolean indicator fields.
 */
function indicatorTerms(incident: IncidentContextInput): string[] {
  const terms: string[] = [];
  if (incident.immediate_danger) terms.push("immediate danger");
  if (incident.medical_emergency) terms.push("medical emergency");
  if (incident.mobility_impairment) terms.push("mobility impairment");
  if (incident.food_shortage) terms.push("food shortage");
  if (incident.water_risk) terms.push("water risk");
  return terms;
}

/**
 * Builds the deterministic retrieval query + category filter for an
 * incident. Never throws, never returns an empty string: a fixed,
 * generic closing phrase (`"emergency response guidance"`) is always
 * appended, which alone guarantees `composed` is non-empty even for an
 * incident with no type, no triggered indicators, and no summary/report
 * text — there is no separate "fallback" branch to reason about, the
 * closing phrase itself *is* the guarantee.
 *
 * Composition order: incident type phrase, then active indicator
 * phrases, then a bounded excerpt of `summary` (preferred, since it's
 * already a concise AI-generated description) or `report_text` (used
 * only if `summary` is null/empty), then the closing phrase. The whole
 * result is re-bounded to `MAX_QUERY_LENGTH` as a final safety net.
 */
export function buildIncidentContext(incident: IncidentContextInput): IncidentContext {
  const category = mapIncidentTypeToKnowledgeCategory(incident.incident_type);

  const parts: string[] = [];

  const typeTerm = incidentTypeQueryTerm(incident.incident_type);
  if (typeTerm) parts.push(typeTerm);

  parts.push(...indicatorTerms(incident));

  const summaryText = incident.summary ? normalizeWhitespace(incident.summary) : "";
  const textExcerpt = summaryText
    ? boundedExcerpt(summaryText, MAX_TEXT_EXCERPT_LENGTH)
    : boundedExcerpt(incident.report_text, MAX_TEXT_EXCERPT_LENGTH);
  if (textExcerpt) parts.push(textExcerpt);

  parts.push("emergency response guidance");

  const composed = normalizeWhitespace(parts.join(" "));
  const query = composed.slice(0, MAX_QUERY_LENGTH).trim();

  return { query, category };
}

/** Combined shape returned by `retrieveIncidentKnowledge` — the
 * generated context alongside the *unmodified* existing retrieval
 * result. Deliberately not a new/incompatible result type: `retrieval`
 * is exactly what `retrieveRelevantChunks` already returns
 * (`RetrievalResult`), so M14-D/E can consume it with no translation
 * layer and the existing ok/empty/error semantics documented in
 * `lib/rag/retrieval.ts` are preserved untouched. */
export interface IncidentKnowledgeResult {
  context: IncidentContext;
  retrieval: RetrievalResult;
}

/**
 * Builds the incident's retrieval context, then calls the existing
 * `retrieveRelevantChunks` with the generated query and (when a valid
 * mapping exists) the mapped category. Language is deliberately omitted
 * — see HANDOFF_M14B.md's "Language Decision" (M11 corpus is
 * English-only; `incident.language` is an unvalidated free string, not
 * the `KnowledgeLanguage` union retrieval expects).
 *
 * Preserves the existing three-way retrieval outcome exactly as-is —
 * this function does not transform any of them:
 *   - `{ ok: true, data: [] }`  -> a successful search with no
 *     sufficiently relevant knowledge (`knowledgeFound: false` is a
 *     later-module UI/API concern, not decided here).
 *   - `{ ok: true, data: [...] }` -> relevant chunks were found.
 *   - `{ ok: false, reason, message }` -> an actual retrieval failure
 *     (missing API key / provider error / database error), which must
 *     stay distinguishable from "successful search, zero results" — see
 *     module prompt section 15.
 *
 * `retrieveFn` defaults to the real `retrieveRelevantChunks` but can be
 * overridden by tests to avoid making a real embedding/Supabase call
 * (see `intelligence-context.test.ts`'s retrieval-passthrough tests) —
 * this is the smallest change needed for those two cases to be testable
 * offline without duplicating or mocking module internals.
 */
export async function retrieveIncidentKnowledge(
  incident: IncidentContextInput,
  retrieveFn: typeof retrieveRelevantChunks = retrieveRelevantChunks
): Promise<IncidentKnowledgeResult> {
  const context = buildIncidentContext(incident);
  const retrieval = await retrieveFn(context.query, {
    category: context.category ?? undefined,
  });
  return { context, retrieval };
}
