import { NextRequest, NextResponse } from "next/server";
import { DEMO_INCIDENTS } from "@/data/demo-incidents";
import { calculatePriority } from "@/lib/scoring/priority";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/demo/seed
 *
 * Populates database with structured demo disaster incidents for instant evaluation.
 * Skips live Gemini API calls for speed and free-tier quota safety.
 */
export async function POST(request: NextRequest) {
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Database configuration missing." },
      { status: 503 }
    );
  }

  let count = 0;
  for (const seed of DEMO_INCIDENTS) {
    const priority = calculatePriority({
      language: seed.language,
      incidentType: seed.incidentType,
      summary: seed.summary,
      peopleAffected: seed.peopleAffected,
      childrenCount: seed.childrenCount,
      elderlyCount: seed.elderlyCount,
      mobilityImpairment: seed.mobilityImpairment,
      medicalEmergency: seed.medicalEmergency,
      immediateDanger: seed.immediateDanger,
      foodShortage: seed.foodShortage,
      waterRisk: seed.waterRisk,
      needs: seed.needs,
      riskFactors: seed.riskFactors || [],
    });

    const { data: incident, error } = await supabase
      .from("incidents")
      .upsert({
        id: seed.id,
        report_text: seed.reportText,
        normalized_text: seed.reportText,
        language: seed.language,
        incident_type: seed.incidentType,
        summary: seed.summary,
        latitude: seed.latitude,
        longitude: seed.longitude,
        people_affected: seed.peopleAffected,
        children_count: seed.childrenCount,
        elderly_count: seed.elderlyCount,
        mobility_impairment: seed.mobilityImpairment,
        medical_emergency: seed.medicalEmergency,
        immediate_danger: seed.immediateDanger,
        food_shortage: seed.foodShortage,
        water_risk: seed.waterRisk,
        priority_score: priority.score,
        severity: priority.severity,
        status: "NEW",
      })
      .select("id")
      .single();

    if (!error && incident) {
      count++;
      // Insert associated needs
      if (seed.needs.length > 0) {
        await supabase.from("incident_needs").delete().eq("incident_id", incident.id);
        await supabase.from("incident_needs").insert(
          seed.needs.map((need) => ({
            incident_id: incident.id,
            need_type: need,
            priority: 1,
          }))
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Seeded ${count} demo disaster incidents successfully.`,
    count,
  });
}
