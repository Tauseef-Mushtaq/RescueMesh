import { NextRequest, NextResponse } from "next/server";
import { extractIncident } from "@/lib/ai/incident-extraction";
import { calculatePriority } from "@/lib/scoring/priority";
import { parseReportRequest } from "@/lib/validation/report-request";
import { createServiceClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/ai/embeddings";
import { buildIncidentEmbeddingText } from "@/lib/incidents/similarity";
import type { IncidentRow, IncidentSeverity, IncidentStatus, IncidentType } from "@/lib/supabase/types";

const DASHBOARD_COLUMNS =
  "id, incident_type, summary, language, latitude, longitude, people_affected, children_count, elderly_count, medical_emergency, mobility_impairment, immediate_danger, food_shortage, water_risk, priority_score, severity, status, created_at, updated_at";

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;

const VALID_SEVERITIES: IncidentSeverity[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
const VALID_STATUSES: IncidentStatus[] = ["NEW", "VERIFIED", "RESOLVED"];
const VALID_TYPES: IncidentType[] = [
  "flood",
  "earthquake",
  "fire",
  "building_collapse",
  "medical_emergency",
  "missing_person",
  "road_blockage",
  "food_shortage",
  "shelter_need",
  "other",
];

/**
 * GET /api/incidents
 *
 * Server-side read path for the coordinator dashboard (M08). Returns
 * persisted incidents directly from Supabase — priority_score/severity
 * are read as stored, never recalculated here. The browser never talks
 * to Supabase directly; this route uses the trusted server client.
 *
 * Optional query params: severity, status, incidentType, limit.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const severityParam = searchParams.get("severity");
  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("incidentType");
  const limitParam = searchParams.get("limit");

  let limit = DEFAULT_LIST_LIMIT;
  if (limitParam) {
    const parsedLimit = Number(limitParam);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, MAX_LIST_LIMIT);
    }
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh GET /api/incidents: Supabase service config missing.");
    }
    return NextResponse.json(
      { success: false, error: "Incident data is currently unavailable." },
      { status: 503 }
    );
  }

  let query = supabase
    .from("incidents")
    .select(DASHBOARD_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (severityParam && VALID_SEVERITIES.includes(severityParam as IncidentSeverity)) {
    query = query.eq("severity", severityParam);
  }
  if (statusParam && VALID_STATUSES.includes(statusParam as IncidentStatus)) {
    query = query.eq("status", statusParam);
  }
  if (typeParam && VALID_TYPES.includes(typeParam as IncidentType)) {
    query = query.eq("incident_type", typeParam);
  }

  const { data, error } = await query.returns<
    Pick<
      IncidentRow,
      | "id"
      | "incident_type"
      | "summary"
      | "language"
      | "latitude"
      | "longitude"
      | "people_affected"
      | "children_count"
      | "elderly_count"
      | "medical_emergency"
      | "mobility_impairment"
      | "immediate_danger"
      | "food_shortage"
      | "water_risk"
      | "priority_score"
      | "severity"
      | "status"
      | "created_at"
      | "updated_at"
    >[]
  >();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh GET /api/incidents: query failed:", error.message);
    }
    return NextResponse.json(
      { success: false, error: "Unable to load incidents." },
      { status: 500 }
    );
  }

  const incidents = (data ?? []).map((row) => ({
    id: row.id,
    incidentType: row.incident_type,
    summary: row.summary,
    language: row.language,
    latitude: row.latitude,
    longitude: row.longitude,
    peopleAffected: row.people_affected,
    childrenCount: row.children_count,
    elderlyCount: row.elderly_count,
    medicalEmergency: row.medical_emergency,
    mobilityImpairment: row.mobility_impairment,
    immediateDanger: row.immediate_danger,
    foodShortage: row.food_shortage,
    waterRisk: row.water_risk,
    priorityScore: row.priority_score,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return NextResponse.json({ success: true, data: incidents }, { status: 200 });
}

/**
 * POST /api/incidents
 *
 * The authoritative persistence pipeline:
 *
 *   request -> validate -> extractIncident() -> calculatePriority()
 *     -> insert incidents row -> insert incident_needs rows -> response
 *
 * Priority/severity are ALWAYS computed here, server-side, from Gemini's
 * extraction via the deterministic M06 engine. Any client-supplied score
 * or severity in the request body is ignored — this endpoint's request
 * shape (see parseReportRequest) doesn't even accept one.
 *
 * Uses the service-role Supabase client (bypasses RLS by design — see
 * the M02 migration's RLS notes). Never expose that client or its key
 * to the browser.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const input = parseReportRequest(body);
  if (!input) {
    return NextResponse.json(
      { success: false, error: "Invalid or incomplete report data." },
      { status: 400 }
    );
  }

  // 1. AI understanding (reuses M05 exactly — including reporter-value
  //    reconciliation and safe defaults).
  const extraction = await extractIncident(input);
  if (!extraction.ok) {
    const status = extraction.reason === "missing_api_key" ? 503 : 502;
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh /api/incidents extraction failure:", extraction.reason);
    }
    return NextResponse.json({ success: false, error: extraction.message }, { status });
  }
  const extracted = extraction.data;

  // 2. Deterministic priority (reuses M06 exactly — never from Gemini,
  //    never from the client).
  const priority = calculatePriority(extracted);

  // 3. Persist. Missing Supabase configuration must fail gracefully
  //    rather than crash — createServiceClient() throws if env vars
  //    are unset.
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh /api/incidents: Supabase service config missing.");
    }
    return NextResponse.json(
      { success: false, error: "Persistence is currently unavailable." },
      { status: 503 }
    );
  }

  // 2.5 Generate embedding for semantic similarity search (M18)
  let embedding: number[] | null = null;
  const embeddingText = buildIncidentEmbeddingText(input.reportText, extracted.summary, extracted.incidentType);
  const embedRes = await embedTexts([embeddingText], "RETRIEVAL_DOCUMENT");
  if (embedRes.ok && embedRes.data.length > 0) {
    embedding = embedRes.data[0];
  }

  const fullReportText = input.reporterContact || input.reporterName
    ? `${input.reportText}\n\n[Reporter Contact: ${input.reporterName ?? "Anonymous"} | Phone: ${input.reporterContact ?? "Not Provided"}]`
    : input.reportText;

  const incidentInsert = {
    report_text: fullReportText,
    normalized_text: fullReportText,
    language: extracted.language,
    incident_type: extracted.incidentType,
    summary: input.reporterContact || input.reporterName 
      ? `${extracted.summary} (Reporter: ${input.reporterName ?? "Resident"}, Contact: ${input.reporterContact ?? "N/A"})`
      : extracted.summary,
    latitude: input.latitude,
    longitude: input.longitude,
    people_affected: extracted.peopleAffected,
    children_count: extracted.childrenCount,
    elderly_count: extracted.elderlyCount,
    mobility_impairment: extracted.mobilityImpairment,
    medical_emergency: extracted.medicalEmergency,
    immediate_danger: extracted.immediateDanger,
    food_shortage: extracted.foodShortage,
    water_risk: extracted.waterRisk,
    priority_score: priority.score,
    severity: priority.severity,
    confidence: null,
    status: "NEW" as const,
    embedding: embedding ? JSON.stringify(embedding) : null,
  };

  const { data: incidentRow, error: incidentError } = await supabase
    .from("incidents")
    .insert(incidentInsert)
    .select()
    .single<IncidentRow>();

  if (incidentError || !incidentRow) {
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh /api/incidents: incident insert failed:", {
        message: incidentError?.message,
        code: incidentError?.code,
        details: incidentError?.details,
        hint: incidentError?.hint,
        // A "TypeError: fetch failed" message means the request never
        // reached Supabase at all (DNS/connection/TLS-level, not a
        // permission or SQL error) — the underlying cause (if present)
        // narrows that down without ever logging secrets.
        cause:
          incidentError?.message === "TypeError: fetch failed" &&
          incidentError &&
          "cause" in incidentError
            ? String((incidentError as { cause?: unknown }).cause)
            : undefined,
      });
    }
    return NextResponse.json(
      { success: false, error: "Unable to create the incident right now." },
      { status: 500 }
    );
  }

  // 4. Needs, one row per extracted need. Priority within the list is
  //    derived deterministically from extraction order (first need is
  //    most prominent) rather than asking Gemini for another score.
  if (extracted.needs.length > 0) {
    const needsInsert = extracted.needs.map((needType, index) => ({
      incident_id: incidentRow.id,
      need_type: needType,
      priority: extracted.needs.length - index,
    }));

    const { error: needsError } = await supabase.from("incident_needs").insert(needsInsert);

    if (needsError) {
      // Don't report a successful creation on a half-persisted incident.
      // No multi-table transaction is available through this client, so
      // the safest straightforward sequence is: best-effort delete the
      // incident we just inserted, then report a controlled failure.
      if (process.env.NODE_ENV === "development") {
        console.error("RescueMesh /api/incidents: needs insert failed:", needsError.message);
      }
      await supabase.from("incidents").delete().eq("id", incidentRow.id);
      return NextResponse.json(
        { success: false, error: "Unable to create the incident right now." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        id: incidentRow.id,
        incidentType: incidentRow.incident_type,
        language: incidentRow.language,
        summary: incidentRow.summary,
        priorityScore: incidentRow.priority_score,
        severity: incidentRow.severity,
        status: incidentRow.status,
        needs: extracted.needs,
        createdAt: incidentRow.created_at,
      },
    },
    { status: 201 }
  );
}
