/**
 * Runtime validation for AI-extracted incident data.
 *
 * Deliberately dependency-free (no Zod) per PROJECT_RULES.md — this is a
 * small, hand-written validator so raw Gemini output is never trusted
 * blindly before it reaches the rest of the application.
 */

export const INCIDENT_TYPES = [
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
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const EXTRACTION_LANGUAGES = ["English", "Urdu", "Roman Urdu"] as const;

export type ExtractionLanguage = (typeof EXTRACTION_LANGUAGES)[number];

export interface ExtractedIncident {
  incidentType: IncidentType;
  language: ExtractionLanguage;
  summary: string;
  peopleAffected: number;
  childrenCount: number;
  elderlyCount: number;
  mobilityImpairment: boolean;
  medicalEmergency: boolean;
  immediateDanger: boolean;
  foodShortage: boolean;
  waterRisk: boolean;
  needs: string[];
  riskFactors: string[];
}

/** Safe fallback used only when a field truly cannot be recovered. */
export const SAFE_DEFAULT_EXTRACTION: ExtractedIncident = {
  incidentType: "other",
  language: "English",
  summary: "",
  peopleAffected: 0,
  childrenCount: 0,
  elderlyCount: 0,
  mobilityImpairment: false,
  medicalEmergency: false,
  immediateDanger: false,
  foodShortage: false,
  waterRisk: false,
  needs: [],
  riskFactors: [],
};

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data: ExtractedIncident | null;
}

/**
 * Validates an unknown value against the ExtractedIncident shape.
 * Never throws — returns a result object so callers can fail safely.
 */
export function validateExtractedIncident(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: ["AI output is not an object."], data: null };
  }

  const record = input as Record<string, unknown>;

  if (
    typeof record.incidentType !== "string" ||
    !INCIDENT_TYPES.includes(record.incidentType as IncidentType)
  ) {
    errors.push("incidentType is missing or not a recognized incident type.");
  }

  if (
    typeof record.language !== "string" ||
    !EXTRACTION_LANGUAGES.includes(record.language as ExtractionLanguage)
  ) {
    errors.push("language is missing or not one of English/Urdu/Roman Urdu.");
  }

  if (typeof record.summary !== "string" || record.summary.trim().length === 0) {
    errors.push("summary is missing or empty.");
  }

  if (!isNonNegativeInteger(record.peopleAffected)) {
    errors.push("peopleAffected must be a non-negative integer.");
  }

  if (!isNonNegativeInteger(record.childrenCount)) {
    errors.push("childrenCount must be a non-negative integer.");
  }

  if (!isNonNegativeInteger(record.elderlyCount)) {
    errors.push("elderlyCount must be a non-negative integer.");
  }

  for (const key of [
    "mobilityImpairment",
    "medicalEmergency",
    "immediateDanger",
    "foodShortage",
    "waterRisk",
  ] as const) {
    if (typeof record[key] !== "boolean") {
      errors.push(`${key} must be a boolean.`);
    }
  }

  if (!isStringArray(record.needs)) {
    errors.push("needs must be an array of strings.");
  }

  if (!isStringArray(record.riskFactors)) {
    errors.push("riskFactors must be an array of strings.");
  }

  if (errors.length > 0) {
    return { valid: false, errors, data: null };
  }

  const data: ExtractedIncident = {
    incidentType: record.incidentType as IncidentType,
    language: record.language as ExtractionLanguage,
    summary: (record.summary as string).trim(),
    peopleAffected: record.peopleAffected as number,
    childrenCount: record.childrenCount as number,
    elderlyCount: record.elderlyCount as number,
    mobilityImpairment: record.mobilityImpairment as boolean,
    medicalEmergency: record.medicalEmergency as boolean,
    immediateDanger: record.immediateDanger as boolean,
    foodShortage: record.foodShortage as boolean,
    waterRisk: record.waterRisk as boolean,
    needs: record.needs as string[],
    riskFactors: record.riskFactors as string[],
  };

  return { valid: true, errors: [], data };
}
