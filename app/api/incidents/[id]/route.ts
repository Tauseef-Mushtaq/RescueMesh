import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { IncidentNeedRow, IncidentRow, IncidentStatus } from "@/lib/supabase/types";

const DETAIL_COLUMNS =
  "id, report_text, reporter_name, reporter_contact, image_url, normalized_text, language, incident_type, summary, latitude, longitude, people_affected, children_count, elderly_count, medical_emergency, mobility_impairment, immediate_danger, food_shortage, water_risk, priority_score, severity, confidence, status, created_at, updated_at";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES: IncidentStatus[] = ["NEW", "VERIFIED", "RESOLVED"];

type DetailIncidentRow = Pick<
  IncidentRow,
  | "id"
  | "report_text"
  | "reporter_name"
  | "reporter_contact"
  | "image_url"
  | "normalized_text"
  | "language"
  | "incident_type"
  | "summary"
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
  | "confidence"
  | "status"
  | "created_at"
  | "updated_at"
>;

/**
 * GET /api/incidents/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid incident ID." },
      { status: 400 }
    );
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Incident data is currently unavailable." },
      { status: 503 }
    );
  }

  const { data: incidentRow, error: incidentError } = await supabase
    .from("incidents")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle<DetailIncidentRow>();

  if (incidentError) {
    return NextResponse.json(
      { success: false, error: "Unable to load incident." },
      { status: 500 }
    );
  }

  if (!incidentRow) {
    return NextResponse.json(
      { success: false, error: "Incident not found." },
      { status: 404 }
    );
  }

  const { data: needRows, error: needsError } = await supabase
    .from("incident_needs")
    .select("id, need_type, priority")
    .eq("incident_id", id)
    .returns<Pick<IncidentNeedRow, "id" | "need_type" | "priority">[]>();

  if (needsError) {
    return NextResponse.json(
      { success: false, error: "Unable to load incident." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        id: incidentRow.id,
        reportText: incidentRow.report_text,
        reporterName: incidentRow.reporter_name,
        reporterContact: incidentRow.reporter_contact,
        imageUrl: incidentRow.image_url,
        normalizedText: incidentRow.normalized_text,
        language: incidentRow.language,
        incidentType: incidentRow.incident_type,
        summary: incidentRow.summary,
        latitude: incidentRow.latitude,
        longitude: incidentRow.longitude,
        peopleAffected: incidentRow.people_affected,
        childrenCount: incidentRow.children_count,
        elderlyCount: incidentRow.elderly_count,
        medicalEmergency: incidentRow.medical_emergency,
        mobilityImpairment: incidentRow.mobility_impairment,
        immediateDanger: incidentRow.immediate_danger,
        foodShortage: incidentRow.food_shortage,
        waterRisk: incidentRow.water_risk,
        priorityScore: incidentRow.priority_score,
        severity: incidentRow.severity,
        confidence: incidentRow.confidence,
        status: incidentRow.status,
        createdAt: incidentRow.created_at,
        updatedAt: incidentRow.updated_at,
        needs: (needRows ?? []).map((need) => ({
          id: need.id,
          needType: need.need_type,
          priority: need.priority,
        })),
      },
    },
    { status: 200 }
  );
}

/**
 * PATCH /api/incidents/[id]
 *
 * Allows emergency coordinators to update incident status (NEW -> VERIFIED -> RESOLVED).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { success: false, error: "Invalid incident ID." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { success: false, error: "Request body must be an object." },
      { status: 400 }
    );
  }

  const { status } = body as Record<string, unknown>;

  if (typeof status !== "string" || !VALID_STATUSES.includes(status as IncidentStatus)) {
    return NextResponse.json(
      { success: false, error: "Invalid status value. Must be NEW, VERIFIED, or RESOLVED." },
      { status: 400 }
    );
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Database configuration missing." },
      { status: 503 }
    );
  }

  const { data: updated, error } = await supabase
    .from("incidents")
    .update({ status: status as IncidentStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error || !updated) {
    return NextResponse.json(
      { success: false, error: "Failed to update incident status." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, status: updated.status }, { status: 200 });
}
