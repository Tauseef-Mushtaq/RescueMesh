/**
 * Incident-type -> knowledge-category mapping (M14).
 *
 * Pure, deterministic, Gemini-free — same rationale as
 * `lib/scoring/priority.ts` being pulled out as a standalone pure module:
 * safe to unit test in isolation, safe to call from server code without
 * any network/database dependency.
 *
 * Per HANDOFF_M14A.md's "Existing Knowledge Categories" section, every
 * `IncidentType` value except `"other"` is a verbatim, identically
 * spelled `KnowledgeCategory` member, so this mapping is an identity
 * function over the 9 shared values plus two explicit "no filter" cases.
 * It intentionally does NOT map `"other"` (or `null`) to `"general"` —
 * that mapping is not asserted anywhere in the schema, and inventing it
 * would violate the M14 plan's "do not invent mappings" rule. `"other"`/
 * `null` incidents instead get unfiltered (general) retrieval, exactly
 * like the M13 `/ask` UI's default "no category selected" behavior.
 */
import type { IncidentType, KnowledgeCategory } from "@/lib/supabase/types";

/**
 * Returns the `KnowledgeCategory` to filter retrieval by, or `null` when
 * no valid mapping exists (`incidentType` is `"other"` or `null`) — in
 * which case the caller should omit the `category` option entirely
 * rather than passing `null` through to `retrieveRelevantChunks`, which
 * treats "no category" as "no filter", the desired behavior here.
 */
export function mapIncidentTypeToKnowledgeCategory(
  incidentType: IncidentType | null
): KnowledgeCategory | null {
  if (incidentType === null || incidentType === "other") {
    return null;
  }

  // Every remaining IncidentType member is a verbatim KnowledgeCategory
  // member (see HANDOFF_M14A.md) — this switch exists so TypeScript
  // enforces that fact at compile time (adding a new IncidentType value
  // that has no KnowledgeCategory counterpart becomes a type error here,
  // rather than silently passing an invalid category to retrieval).
  switch (incidentType) {
    case "flood":
    case "earthquake":
    case "fire":
    case "building_collapse":
    case "medical_emergency":
    case "missing_person":
    case "road_blockage":
    case "food_shortage":
    case "shelter_need":
      return incidentType;
    default: {
      const exhaustiveCheck: never = incidentType;
      return exhaustiveCheck;
    }
  }
}
