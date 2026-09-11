/**
 * Focused tests for lib/scoring/priority.ts.
 *
 * No test framework is installed in this project yet (see
 * HANDOFF_M06.md), so this is a small self-running assertion script
 * rather than a describe/it suite — it exits non-zero on failure so it
 * can be wired into a real runner later without rewriting the cases.
 *
 * Run with: npx tsx lib/scoring/priority.test.ts
 */

import {
  calculatePriority,
  severityForScore,
  LARGE_GROUP_THRESHOLD,
  MAX_RAW_SCORE,
} from "./priority";
import type { ExtractedIncident } from "../validation/incident-extraction";

let passed = 0;
let failed = 0;

function assertEqual<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL - ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const BASE_INCIDENT: ExtractedIncident = {
  incidentType: "other",
  language: "English",
  summary: "test incident",
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

// Test 1 — no priority factors
{
  const result = calculatePriority(BASE_INCIDENT);
  assertEqual(result.rawScore, 0, "Test 1: rawScore = 0 with no factors");
  assertEqual(result.score, 0, "Test 1: score = 0 with no factors");
  assertEqual(result.severity, "LOW", "Test 1: severity = LOW with no factors");
}

// Test 2 — immediate danger only
{
  const result = calculatePriority({ ...BASE_INCIDENT, immediateDanger: true });
  const expectedScore = Math.round((25 / MAX_RAW_SCORE) * 100);
  assertEqual(result.rawScore, 25, "Test 2: rawScore = 25 (immediate danger)");
  assertEqual(result.score, expectedScore, "Test 2: normalized score for 25/105");
  assertEqual(result.severity, "LOW", "Test 2: severity stays LOW at this score");
}

// Test 3 — children + medical emergency
//
// Note: the M06 module prompt's own worked example states this case
// should be severity MODERATE, but per its own documented formula
// (round(40/105*100) = 38) and its own boundary table (0-39 = LOW),
// 38 is LOW, not MODERATE. The formula and boundary table are followed
// exactly as specified; this test asserts the value that formula
// actually produces rather than the prompt's inconsistent example.
// See "Known issues" in HANDOFF_M06.md.
{
  const result = calculatePriority({
    ...BASE_INCIDENT,
    childrenCount: 2,
    medicalEmergency: true,
  });
  const expectedScore = Math.round((40 / MAX_RAW_SCORE) * 100);
  assertEqual(result.rawScore, 40, "Test 3: rawScore = 40 (children + medical)");
  assertEqual(result.score, expectedScore, "Test 3: normalized score for 40/105");
  assertEqual(result.severity, severityForScore(expectedScore), "Test 3: severity matches documented boundary table for the computed score");
}

// Test 4 — large group threshold
{
  assertEqual(LARGE_GROUP_THRESHOLD, 10, "Test 4: documented threshold is 10");

  const below = calculatePriority({ ...BASE_INCIDENT, peopleAffected: 9 });
  const at = calculatePriority({ ...BASE_INCIDENT, peopleAffected: 10 });

  const belowFactor = below.factors.find((f) => f.key === "largeGroup");
  const atFactor = at.factors.find((f) => f.key === "largeGroup");

  assertEqual(belowFactor?.triggered, false, "Test 4: peopleAffected=9 -> large group false");
  assertEqual(atFactor?.triggered, true, "Test 4: peopleAffected=10 -> large group true");
}

// Test 5 — all factors triggered
{
  const allTriggered: ExtractedIncident = {
    ...BASE_INCIDENT,
    immediateDanger: true,
    childrenCount: 1,
    medicalEmergency: true,
    mobilityImpairment: true,
    elderlyCount: 1,
    peopleAffected: 10,
    foodShortage: true,
  };
  const result = calculatePriority(allTriggered);
  assertEqual(result.rawScore, 105, "Test 5: rawScore = 105 with every factor triggered");
  assertEqual(result.score, 100, "Test 5: score = 100 with every factor triggered");
  assertEqual(result.severity, "CRITICAL", "Test 5: severity = CRITICAL at max score");
  assertEqual(
    result.factors.every((f) => f.triggered),
    true,
    "Test 5: every factor entry reports triggered = true"
  );
}

// Test 6 — severity boundaries
{
  assertEqual(severityForScore(39), "LOW", "Test 6: 39 -> LOW");
  assertEqual(severityForScore(40), "MODERATE", "Test 6: 40 -> MODERATE");
  assertEqual(severityForScore(59), "MODERATE", "Test 6: 59 -> MODERATE");
  assertEqual(severityForScore(60), "HIGH", "Test 6: 60 -> HIGH");
  assertEqual(severityForScore(79), "HIGH", "Test 6: 79 -> HIGH");
  assertEqual(severityForScore(80), "CRITICAL", "Test 6: 80 -> CRITICAL");
  assertEqual(severityForScore(100), "CRITICAL", "Test 6: 100 -> CRITICAL");
}

// Extra defensive checks — never negative/over 100/NaN/Infinity.
{
  const result = calculatePriority(BASE_INCIDENT);
  assertEqual(Number.isNaN(result.score), false, "Extra: score is never NaN");
  assertEqual(Number.isFinite(result.score), true, "Extra: score is never Infinity");
  assertEqual(result.score >= 0 && result.score <= 100, true, "Extra: score always within 0-100");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
