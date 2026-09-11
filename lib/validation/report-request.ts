/**
 * Shared, dependency-free validation for the report payload accepted by
 * both POST /api/analyze (M05, analysis-only) and POST /api/incidents
 * (M07, persisted). Kept in one place so the two routes never drift.
 *
 * Counts (peopleAffected/childrenCount/elderlyCount) are intentionally
 * nullable here, consistent with the M04 form (which leaves them blank
 * when unspecified) and M05's `IncidentExtractionInput`/reconciliation
 * logic, which treats "null" as "reporter did not state this" rather
 * than forcing a required number at the HTTP boundary.
 */

import type { IncidentExtractionInput } from "@/lib/ai/incident-extraction";

const ALLOWED_LANGUAGES = ["auto", "en", "ur", "ur-roman"] as const;

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Validates and normalizes an unknown request body into
 * IncidentExtractionInput. Returns null for any malformed request —
 * callers should respond 400 in that case. Never throws.
 */
export function parseReportRequest(body: unknown): IncidentExtractionInput | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  if (typeof record.reportText !== "string") return null;
  const reportText = record.reportText.trim();
  if (reportText.length < 10 || reportText.length > 10000) return null;

  if (!isNumberOrNull(record.latitude)) return null;
  if (record.latitude !== null && (record.latitude < -90 || record.latitude > 90)) {
    return null;
  }

  if (!isNumberOrNull(record.longitude)) return null;
  if (record.longitude !== null && (record.longitude < -180 || record.longitude > 180)) {
    return null;
  }

  if (!isNumberOrNull(record.peopleAffected)) return null;
  if (
    record.peopleAffected !== null &&
    (!Number.isInteger(record.peopleAffected) || record.peopleAffected < 0)
  ) {
    return null;
  }

  if (!isNumberOrNull(record.childrenCount)) return null;
  if (
    record.childrenCount !== null &&
    (!Number.isInteger(record.childrenCount) || record.childrenCount < 0)
  ) {
    return null;
  }

  if (!isNumberOrNull(record.elderlyCount)) return null;
  if (
    record.elderlyCount !== null &&
    (!Number.isInteger(record.elderlyCount) || record.elderlyCount < 0)
  ) {
    return null;
  }

  if (
    typeof record.language !== "string" ||
    !ALLOWED_LANGUAGES.includes(record.language as (typeof ALLOWED_LANGUAGES)[number])
  ) {
    return null;
  }

  for (const key of [
    "immediateDanger",
    "medicalEmergency",
    "mobilityImpairment",
    "foodShortage",
    "waterRisk",
  ] as const) {
    if (!isBoolean(record[key])) return null;
  }

  const reporterName = typeof record.reporterName === "string" ? record.reporterName.trim() : null;
  const reporterContact = typeof record.reporterContact === "string" ? record.reporterContact.trim() : null;

  return {
    reportText,
    reporterName: reporterName || null,
    reporterContact: reporterContact || null,
    latitude: record.latitude as number | null,
    longitude: record.longitude as number | null,
    peopleAffected: record.peopleAffected as number | null,
    childrenCount: record.childrenCount as number | null,
    elderlyCount: record.elderlyCount as number | null,
    language: record.language as IncidentExtractionInput["language"],
    immediateDanger: record.immediateDanger as boolean,
    medicalEmergency: record.medicalEmergency as boolean,
    mobilityImpairment: record.mobilityImpairment as boolean,
    foodShortage: record.foodShortage as boolean,
    waterRisk: record.waterRisk as boolean,
    needs: record.needs as string[],
  };
}
