import { NextRequest, NextResponse } from "next/server";
import { findSimilarIncidents } from "@/lib/incidents/similarity";
import { checkRateLimit } from "@/lib/rate-limit";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/similar
 *
 * Find semantically similar incidents (M19).
 * Accepts JSON body:
 * - `incidentId` (optional, string UUID)
 * - `queryText` (optional, string <= 500 chars)
 * - `threshold` (optional, number 0-1, default 0.5)
 * - `limit` (optional, number 1-20, default 5)
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = checkRateLimit(`similar:${ip}`, 20, 60000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again in a minute." },
      { status: 429 }
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
      { success: false, error: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  const { incidentId, queryText, threshold, limit } = body as Record<string, unknown>;

  if (incidentId !== undefined && (typeof incidentId !== "string" || !UUID_PATTERN.test(incidentId))) {
    return NextResponse.json(
      { success: false, error: "Invalid incidentId UUID format." },
      { status: 400 }
    );
  }

  if (queryText !== undefined && (typeof queryText !== "string" || queryText.trim().length === 0 || queryText.length > 500)) {
    return NextResponse.json(
      { success: false, error: "queryText must be a non-empty string under 500 characters." },
      { status: 400 }
    );
  }

  if (!incidentId && !queryText) {
    return NextResponse.json(
      { success: false, error: "Either incidentId or queryText must be provided." },
      { status: 400 }
    );
  }

  const numericThreshold = typeof threshold === "number" && threshold >= 0 && threshold <= 1 ? threshold : 0.5;
  const numericLimit = typeof limit === "number" && limit >= 1 && limit <= 20 ? Math.floor(limit) : 5;

  const result = await findSimilarIncidents({
    queryText: typeof queryText === "string" ? queryText.trim() : undefined,
    excludeIncidentId: typeof incidentId === "string" ? incidentId : undefined,
    threshold: numericThreshold,
    limit: numericLimit,
  });

  if (!result.ok) {
    const status =
      result.reason === "missing_api_key" || result.reason === "missing_supabase_config"
        ? 503
        : result.reason === "embedding_failed"
        ? 502
        : 500;

    return NextResponse.json({ success: false, error: result.message }, { status });
  }

  return NextResponse.json(
    {
      success: true,
      matches: result.matches,
      count: result.matches.length,
    },
    { status: 200 }
  );
}
