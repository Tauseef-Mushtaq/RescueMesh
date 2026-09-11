import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { IncidentRow } from "@/lib/supabase/types";
import { buildIncidentEvidence } from "@/lib/incidents/intelligence-evidence";
import type { IncidentContextInput } from "@/lib/incidents/intelligence-context";
import { generateIncidentIntelligence } from "@/lib/incidents/intelligence-generation";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import {
  handleIntelligenceRequest,
  type FetchIncidentResult,
} from "@/lib/incidents/intelligence-api";

/**
 * POST /api/incidents/[id]/intelligence
 *
 * Explicit, on-demand advisory analysis for one existing incident:
 *
 *   validate UUID -> fetch incident (server-side, narrow select)
 *   -> M14-C/D knowledge evidence -> M14-E grounded Gemini generation
 *   -> IncidentIntelligence
 *
 * ADVISORY / ADDITIVE / READ-ONLY (see AGENTS.md, HANDOFF_M14A-E.md):
 * this route performs no Supabase UPDATE/INSERT/UPSERT of any kind —
 * `priority_score`, `severity`, `status`, `incident_type`, and
 * `confidence` are never even selected below (see INTELLIGENCE_COLUMNS),
 * let alone written back. Nothing here persists the generated
 * `IncidentIntelligence` — every POST performs a fresh analysis (per
 * HANDOFF_M14B.md's Option B decision). There is no GET handler on this
 * route and no other code path that can trigger generation — it only
 * ever runs in response to an explicit POST.
 *
 * All orchestration/HTTP-status logic lives in
 * `lib/incidents/intelligence-api.ts` (`handleIntelligenceRequest`),
 * which is framework-agnostic and independently unit-tested; this file
 * only wires that function to the real Supabase client, the real
 * M14-D/E pipeline, and the real rate limiter.
 */

// Intelligence generation can invoke up to 3 sequential Gemini model
// attempts (lib/incidents/intelligence-generation.ts's MODEL_CHAIN,
// 25s timeout each) — a single request is far more expensive than
// /api/rag's single embed+generate call (app/api/rag/route.ts: 20/min).
// 5 requests/minute per client is enough for a coordinator to analyze
// several incidents in a session while capping worst-case Gemini load
// from one client. See lib/rate-limit.ts for the (in-memory,
// per-process, not distributed — same documented limitation as M12/M13)
// limiter this reuses.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

const INTELLIGENCE_COLUMNS =
  "incident_type, summary, report_text, medical_emergency, mobility_impairment, immediate_danger, food_shortage, water_risk";

/** Narrow Supabase fetch: selects exactly the 8 fields M14-C's
 * `IncidentContextInput` needs — never `id`, `latitude`/`longitude`,
 * `priority_score`, `severity`, `status`, or `confidence` (module
 * prompt sections 8/24). The incident ID used to build the final
 * response comes from the URL param, not from this row. */
async function fetchIncidentForIntelligence(id: string): Promise<FetchIncidentResult> {
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "RescueMesh POST /api/incidents/[id]/intelligence: Supabase service config missing."
      );
    }
    return { ok: false, reason: "config_missing" };
  }

  const { data, error } = await supabase
    .from("incidents")
    .select(INTELLIGENCE_COLUMNS)
    .eq("id", id)
    .maybeSingle<IncidentContextInput>();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "RescueMesh POST /api/incidents/[id]/intelligence: incident query failed:",
        error.message
      );
    }
    return { ok: false, reason: "query_failed" };
  }

  if (!data) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, incident: data };
}

/**
 * No request body is required or read. The incident ID comes from the
 * URL; everything else the model sees comes from the server-side
 * Supabase fetch above and M14-C/D/E's own trusted pipeline — there is
 * no channel through which a client could supply or override incident
 * data, an evidence set, or a generated result (module prompt section
 * 6/26).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clientKey = getClientKey(request);

  const result = await handleIntelligenceRequest(id, {
    checkRateLimit: () => checkRateLimit(`intelligence:${clientKey}`, RATE_LIMIT, RATE_WINDOW_MS),
    fetchIncident: fetchIncidentForIntelligence,
    buildEvidence: (incident) => buildIncidentEvidence(incident),
    generate: (incidentId, incident, evidenceResult) =>
      generateIncidentIntelligence(incidentId, incident, evidenceResult),
  });

  return NextResponse.json(result.body, { status: result.status });
}

// Referenced only so the "never selects these" claim in the doc comment
// above is checkable by a future reader without needing to separately
// open lib/supabase/types.ts.
type _NeverSelectedFields = Pick<
  IncidentRow,
  "id" | "latitude" | "longitude" | "priority_score" | "severity" | "status" | "confidence"
>;
void (undefined as unknown as _NeverSelectedFields);
