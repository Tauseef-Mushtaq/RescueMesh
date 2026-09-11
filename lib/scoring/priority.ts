/**
 * Deterministic Priority Engine (M06)
 *
 * Pure, side-effect-free scoring logic. Takes the validated
 * ExtractedIncident produced by M05's AI extraction and computes a
 * deterministic 0–100 priority score, severity, and a per-factor
 * breakdown for UI explainability.
 *
 * Rules (per AGENTS.md / PRD): AI understands the report; this module
 * decides the score. Gemini is never involved here, and this file has
 * no database, network, or React dependency — it is safe to unit test
 * in isolation and to call from server or client code alike.
 */

import type { ExtractedIncident } from "../validation/incident-extraction";

export type Severity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface PriorityFactor {
  key: string;
  label: string;
  points: number;
  triggered: boolean;
}

export interface PriorityResult {
  rawScore: number;
  maxRawScore: number;
  score: number;
  severity: Severity;
  factors: PriorityFactor[];
}

/**
 * Deterministic threshold for the "large group" factor. The PRD defines
 * the factor (+10 points) but not its exact numerical cutoff — this
 * value is the documented, fixed interpretation used throughout the app.
 */
export const LARGE_GROUP_THRESHOLD = 10;

/** Sum of every factor's points — the maximum possible raw score (105). */
export const MAX_RAW_SCORE = 105;

interface FactorDefinition {
  key: string;
  label: string;
  points: number;
  isTriggered: (incident: ExtractedIncident) => boolean;
}

const FACTOR_DEFINITIONS: FactorDefinition[] = [
  {
    key: "immediateDanger",
    label: "Immediate danger",
    points: 25,
    isTriggered: (incident) => incident.immediateDanger === true,
  },
  {
    key: "childrenPresent",
    label: "Children present",
    points: 20,
    isTriggered: (incident) => incident.childrenCount > 0,
  },
  {
    key: "medicalEmergency",
    label: "Medical emergency",
    points: 20,
    isTriggered: (incident) => incident.medicalEmergency === true,
  },
  {
    key: "mobilityImpairment",
    label: "Mobility impairment",
    points: 15,
    isTriggered: (incident) => incident.mobilityImpairment === true,
  },
  {
    key: "elderlyPresent",
    label: "Elderly present",
    points: 10,
    isTriggered: (incident) => incident.elderlyCount > 0,
  },
  {
    key: "largeGroup",
    label: "Large group",
    points: 10,
    // Documented threshold: peopleAffected >= 10 (see LARGE_GROUP_THRESHOLD).
    isTriggered: (incident) => incident.peopleAffected >= LARGE_GROUP_THRESHOLD,
  },
  {
    key: "foodShortage",
    label: "Food shortage",
    points: 5,
    isTriggered: (incident) => incident.foodShortage === true,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Maps a normalized 0–100 score to a severity band.
 * Boundaries: 0–39 LOW, 40–59 MODERATE, 60–79 HIGH, 80–100 CRITICAL.
 */
export function severityForScore(score: number): Severity {
  const clamped = clamp(score, 0, 100);
  if (clamped >= 80) return "CRITICAL";
  if (clamped >= 60) return "HIGH";
  if (clamped >= 40) return "MODERATE";
  return "LOW";
}

/**
 * Calculates the deterministic priority score, severity, and factor
 * breakdown for a validated ExtractedIncident. Pure function: the same
 * input always produces the same output. Never throws for a well-formed
 * ExtractedIncident (as guaranteed by lib/validation's validator).
 */
export function calculatePriority(incident: ExtractedIncident): PriorityResult {
  const factors: PriorityFactor[] = FACTOR_DEFINITIONS.map((def) => ({
    key: def.key,
    label: def.label,
    points: def.points,
    triggered: def.isTriggered(incident),
  }));

  const rawScore = factors.reduce(
    (sum, factor) => sum + (factor.triggered ? factor.points : 0),
    0
  );

  // Normalize raw/105 -> 0-100, rounded, then clamped as a defensive
  // guard against any future factor-table drift.
  const normalized = Math.round((rawScore / MAX_RAW_SCORE) * 100);
  const score = clamp(Number.isFinite(normalized) ? normalized : 0, 0, 100);

  return {
    rawScore,
    maxRawScore: MAX_RAW_SCORE,
    score,
    severity: severityForScore(score),
    factors,
  };
}
