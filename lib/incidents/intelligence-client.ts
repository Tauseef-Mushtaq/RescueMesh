/**
 * Pure, testable helpers for the M14 "Incident Intelligence" client.
 * Same rationale and same shape as `lib/rag/client-response.ts` (M13):
 * extracted so response-shape validation can be unit-tested without
 * rendering React, and so a malformed/unexpected API response is treated
 * as an error state rather than rendered as if it were real guidance.
 *
 * Mirrors the actual response contract `lib/incidents/intelligence-types
 * .ts` defines and the future `POST /api/incidents/[id]/intelligence`
 * (M14-E) will return — does not invent fields beyond that contract.
 */
import type { KnowledgeCategory } from "@/lib/supabase/types";
import type {
  IncidentIntelligence,
  IncidentIntelligenceSource,
} from "@/lib/incidents/intelligence-types";

const VALID_KNOWLEDGE_CATEGORIES: readonly KnowledgeCategory[] = [
  "flood",
  "earthquake",
  "fire",
  "building_collapse",
  "medical_emergency",
  "missing_person",
  "road_blockage",
  "food_shortage",
  "shelter_need",
  "general",
];

function isValidCategory(value: unknown): value is KnowledgeCategory | null {
  return (
    value === null ||
    (typeof value === "string" &&
      VALID_KNOWLEDGE_CATEGORIES.includes(value as KnowledgeCategory))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Runtime type guard for a single retrieved-source entry. Rejects a
 * source whose `category` is present but not one of the actual
 * `KnowledgeCategory` values — a malformed category is treated the same
 * as any other malformed field, not silently passed through. */
export function isIncidentIntelligenceSource(
  value: unknown
): value is IncidentIntelligenceSource {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    isNullableString(record.title) &&
    isNullableString(record.slug) &&
    isValidCategory(record.category)
  );
}

/** Runtime type guard for `POST /api/incidents/[id]/intelligence`'s
 * success `data` payload. Used so the UI (M14-F) never renders a
 * partially-formed or unexpected response as if it were grounded
 * guidance — a failure here routes to the same "error" UI state as an
 * HTTP-level failure, per the M14 plan's "malformed responses must be
 * treated as errors" requirement. */
export function isIncidentIntelligenceData(
  value: unknown
): value is IncidentIntelligence {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.incidentId === "string" &&
    record.incidentId.length > 0 &&
    typeof record.knowledgeFound === "boolean" &&
    typeof record.assessment === "string" &&
    isStringArray(record.actions) &&
    isStringArray(record.watchFor) &&
    isStringArray(record.informationGaps) &&
    Array.isArray(record.sources) &&
    record.sources.every(isIncidentIntelligenceSource)
  );
}

/** Plain-language fallback, used only when the API response itself
 * didn't include an `error` message. Mirrors
 * `fallbackErrorForStatus` in `lib/rag/client-response.ts` — same
 * status codes, same intent (never leak a raw provider/internal error to
 * the UI). The 404 case is new relative to `/api/rag` (that endpoint has
 * no notion of "not found"; an incident lookup does). */
export function fallbackErrorForStatus(status: number): string {
  if (status === 404) {
    return "This incident could not be found.";
  }
  if (status === 429) {
    return "RescueMesh AI is temporarily rate-limited. Please try again shortly.";
  }
  if (status === 503) {
    return "RescueMesh AI is temporarily unavailable. Please try again later.";
  }
  if (status === 400) {
    return "Unable to analyze this incident — invalid request.";
  }
  return "RescueMesh AI couldn't complete that analysis. Please try again.";
}
