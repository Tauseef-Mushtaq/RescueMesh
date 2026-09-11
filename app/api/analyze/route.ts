import { NextRequest, NextResponse } from "next/server";
import { extractIncident } from "@/lib/ai/incident-extraction";
import { parseReportRequest } from "@/lib/validation/report-request";

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

  const result = await extractIncident(input);

  if (!result.ok) {
    const status = result.reason === "missing_api_key" ? 503 : 502;
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh /api/analyze failure:", result.reason);
    }
    return NextResponse.json({ success: false, error: result.message }, { status });
  }

  if (process.env.NODE_ENV === "development") {
    console.log("RescueMesh incident extracted:", result.data);
  }

  return NextResponse.json({ success: true, data: result.data });
}
