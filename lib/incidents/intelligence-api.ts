/**
 * Secure Intelligence API — orchestration (M14-F).
 *
 * This file contains everything about `POST /api/incidents/[id]
 * /intelligence` that can be expressed as plain, dependency-injected
 * TypeScript: UUID validation, HTTP status-code mapping for every
 * failure reason M14-C/D/E can produce, and the request orchestration
 * itself. `app/api/incidents/[id]/intelligence/route.ts` is a thin
 * Next.js wrapper around `handleIntelligenceRequest` below, wiring in
 * the real Supabase fetch / M14-C-D-E pipeline / rate limiter.
 *
 * Kept separate from the route file specifically so the full request
 * flow (rate limit -> UUID validation -> fetch -> evidence -> generate
 * -> response) is unit-testable with `npx tsx` and injected fakes,
 * without needing a running Next.js server, a real Supabase project, or
 * a real Gemini key (module prompt section 30: "isolate small pure
 * helpers or use dependency injection... do not duplicate production
 * logic solely for tests").
 */
import type { IncidentContextInput } from "@/lib/incidents/intelligence-context";
import type { IncidentEvidenceResult } from "@/lib/incidents/intelligence-evidence";
import type {
  FullIncidentIntelligenceResult,
  IncidentIntelligenceFailureReason,
} from "@/lib/incidents/intelligence-generation";
import { isIncidentIntelligenceData } from "@/lib/incidents/intelligence-client";
import type { IncidentIntelligence } from "@/lib/incidents/intelligence-types";

/** Same pattern as the existing `app/api/incidents/[id]/route.ts`.
 * Redeclared locally rather than extracted into a shared util, matching
 * that file's own existing convention (a local regex per route) — see
 * AGENTS.md "avoid unnecessary refactoring of code outside the assigned
 * module." */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidIncidentId(id: string): boolean {
  return UUID_PATTERN.test(id);
}

/** Result of the server-side incident fetch this route needs. Only the
 * 8 fields `IncidentContextInput` (M14-C) actually uses are carried —
 * never `id`/`latitude`/`longitude`/`priority_score`/`severity`/
 * `status` (module prompt section 8). */
export type FetchIncidentResult =
  | { ok: true; incident: IncidentContextInput }
  | { ok: false; reason: "not_found" | "config_missing" | "query_failed" };

export interface IntelligenceApiDeps {
  /** Returns true if the request is within the endpoint's rate limit.
   * The route wires this to `checkRateLimit` (`lib/rate-limit.ts`); a
   * fake in tests can return true/false deterministically without ever
   * touching the real in-memory bucket map. */
  checkRateLimit: () => boolean;
  /** Narrow, server-side incident fetch. The route wires this to a
   * Supabase query selecting exactly the 8 M14-C fields; tests inject a
   * fake that never touches a network or database. */
  fetchIncident: (id: string) => Promise<FetchIncidentResult>;
  /** M14-D. The route wires this to `buildIncidentEvidence`. */
  buildEvidence: (incident: IncidentContextInput) => Promise<IncidentEvidenceResult>;
  /** M14-E. The route wires this to `generateIncidentIntelligence`. */
  generate: (
    incidentId: string,
    incident: IncidentContextInput,
    evidenceResult: IncidentEvidenceResult
  ) => Promise<FullIncidentIntelligenceResult>;
}

export interface ApiResponse {
  status: number;
  body: { success: true; data: IncidentIntelligence } | { success: false; error: string };
}

function ok(status: number, data: IncidentIntelligence): ApiResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, error: string): ApiResponse {
  return { status, body: { success: false, error } };
}

/** HTTP status for a `FullIncidentIntelligenceResult` failure reason.
 * Mirrors the codebase's existing convention (see `/api/analyze`,
 * `/api/rag`): 503 for missing configuration, 500 for a database-layer
 * failure, 502 for a provider/generation failure (including a Gemini
 * timeout or malformed output — neither is the caller's fault, and none
 * of them are safe to describe more specifically to the client). The
 * exhaustive switch (no `default`) means a new
 * `IncidentIntelligenceFailureReason` value added later fails `tsc`
 * here instead of silently falling through to a wrong status. */
function statusForFailureReason(reason: IncidentIntelligenceFailureReason): number {
  switch (reason) {
    case "missing_api_key":
      return 503;
    case "database_error":
      return 500;
    case "provider_error":
    case "timeout":
    case "invalid_output":
      return 502;
  }
}

const GENERIC_ANALYSIS_ERROR = "Unable to analyze this incident right now.";
const RATE_LIMITED_ERROR = "Too many requests. Please try again shortly.";
const NOT_FOUND_ERROR = "This incident could not be found.";
const CONFIG_UNAVAILABLE_ERROR = "RescueMesh AI is temporarily unavailable. Please try again later.";
const INVALID_ID_ERROR = "Invalid incident ID.";

/**
 * The full M14-F request flow, framework-agnostic.
 *
 *   rate limit -> UUID validation -> fetch incident -> build evidence
 *   -> generate intelligence -> validate response shape -> respond
 *
 * Every step that can reject the request short-circuits before any
 * more expensive step runs (module prompt section 2/15: "no retrieval
 * or Gemini generation after the request has already been rejected").
 * Never throws — every branch returns a concrete `ApiResponse`.
 */
export async function handleIntelligenceRequest(
  incidentId: string,
  deps: IntelligenceApiDeps
): Promise<ApiResponse> {
  // 1. Rate limit — cheapest possible rejection, checked first (same
  //    ordering as the existing app/api/rag/route.ts).
  if (!deps.checkRateLimit()) {
    return fail(429, RATE_LIMITED_ERROR);
  }

  // 2. UUID validation — no Supabase query for an obviously invalid ID.
  if (!isValidIncidentId(incidentId)) {
    return fail(400, INVALID_ID_ERROR);
  }

  // 3. Server-side incident fetch. The client never supplies incident
  //    data — the only client-controlled input to this whole flow is
  //    the ID in the URL.
  const fetched = await deps.fetchIncident(incidentId);
  if (!fetched.ok) {
    if (fetched.reason === "not_found") return fail(404, NOT_FOUND_ERROR);
    if (fetched.reason === "config_missing") return fail(503, CONFIG_UNAVAILABLE_ERROR);
    return fail(500, GENERIC_ANALYSIS_ERROR);
  }

  // 4. Evidence (M14-D, itself wrapping M14-C's context+retrieval) and
  //    5. generation (M14-E) — both already implement the "zero
  //    evidence -> no Gemini call" and "retrieval failure != no
  //    knowledge" rules; this route does not reimplement either.
  const evidenceResult = await deps.buildEvidence(fetched.incident);
  const result = await deps.generate(incidentId, fetched.incident, evidenceResult);

  if (!result.ok) {
    return fail(statusForFailureReason(result.reason), result.message);
  }

  // 6. Defensive runtime validation at the API boundary (module prompt
  //    section 19) — reuses the existing M14-B client validator rather
  //    than a second, possibly-contradictory schema. This should never
  //    fail given M14-E's own internal validation, but the boundary
  //    does not assume that.
  if (!isIncidentIntelligenceData(result.data)) {
    return fail(500, GENERIC_ANALYSIS_ERROR);
  }

  return ok(200, result.data);
}
