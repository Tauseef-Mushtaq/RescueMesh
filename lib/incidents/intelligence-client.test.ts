/**
 * Focused tests for lib/incidents/intelligence-client.ts (M14-B).
 *
 * No test framework is installed in this project yet — see
 * lib/rag/client-response.test.ts for the established convention this
 * follows: a small self-running assertion script that exits non-zero on
 * failure.
 *
 * Run with: npx tsx lib/incidents/intelligence-client.test.ts
 */

import {
  fallbackErrorForStatus,
  isIncidentIntelligenceData,
  isIncidentIntelligenceSource,
} from "./intelligence-client";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

// --- isIncidentIntelligenceSource -----------------------------------------

assert(
  isIncidentIntelligenceSource({
    title: "Earthquake Safety",
    slug: "earthquake-safety",
    category: "earthquake",
  }) === true,
  "well-formed source is recognized"
);
assert(
  isIncidentIntelligenceSource({ title: null, slug: null, category: null }) === true,
  "all-null source is recognized (nullable fields are legitimately null, not malformed)"
);
assert(
  isIncidentIntelligenceSource({ title: "X", slug: "x", category: "not-a-real-category" }) ===
    false,
  "invalid category string is rejected"
);
assert(
  isIncidentIntelligenceSource({ title: 42, slug: "x", category: null }) === false,
  "non-string/non-null title is rejected"
);
assert(isIncidentIntelligenceSource(null) === false, "null source is rejected");
assert(isIncidentIntelligenceSource("x") === false, "non-object source is rejected");

// --- isIncidentIntelligenceData: knowledgeFound = true ----------------------

const validFoundPayload = {
  incidentId: "3b9a1f2e-6b1a-4b8a-9b7a-2a3b4c5d6e7f",
  knowledgeFound: true,
  assessment: "Reported structural damage with possible trapped persons.",
  actions: ["Avoid re-entering the structure.", "Contact local emergency services."],
  watchFor: ["Aftershocks", "Secondary collapse"],
  informationGaps: ["Building occupancy status is not reported."],
  sources: [{ title: "Earthquake Safety", slug: "earthquake-safety", category: "earthquake" }],
};

assert(
  isIncidentIntelligenceData(validFoundPayload) === true,
  "well-formed knowledgeFound:true payload is recognized"
);

// --- isIncidentIntelligenceData: knowledgeFound = false ---------------------

const validNotFoundPayload = {
  incidentId: "3b9a1f2e-6b1a-4b8a-9b7a-2a3b4c5d6e7f",
  knowledgeFound: false,
  assessment: "No verified RescueMesh knowledge was found for this incident.",
  actions: [],
  watchFor: [],
  informationGaps: [],
  sources: [],
};

assert(
  isIncidentIntelligenceData(validNotFoundPayload) === true,
  "well-formed knowledgeFound:false payload with empty arrays is recognized"
);

// --- isIncidentIntelligenceData: malformed cases -----------------------------

assert(isIncidentIntelligenceData(null) === false, "null is rejected");
assert(isIncidentIntelligenceData(undefined) === false, "undefined is rejected");
assert(isIncidentIntelligenceData("a string") === false, "a bare string is rejected");
assert(isIncidentIntelligenceData({}) === false, "empty object is rejected");
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, incidentId: "" }) === false,
  "empty-string incidentId is rejected"
);
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, incidentId: undefined }) === false,
  "missing incidentId is rejected"
);
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, knowledgeFound: "yes" }) === false,
  "non-boolean knowledgeFound is rejected"
);
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, assessment: 42 }) === false,
  "non-string assessment is rejected"
);
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, actions: "not-an-array" }) === false,
  "non-array actions is rejected"
);
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, actions: ["ok", 42] }) === false,
  "actions array with a non-string entry is rejected"
);
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, watchFor: [null] }) === false,
  "watchFor array with a non-string entry is rejected"
);
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, informationGaps: undefined }) === false,
  "missing informationGaps is rejected"
);
assert(
  isIncidentIntelligenceData({
    ...validFoundPayload,
    sources: [{ title: "X", slug: "x", category: "invalid" }],
  }) === false,
  "a single malformed source invalidates the whole payload"
);
assert(
  isIncidentIntelligenceData({ ...validFoundPayload, sources: "not-an-array" }) === false,
  "non-array sources is rejected"
);

// --- fallbackErrorForStatus -------------------------------------------------

assert(fallbackErrorForStatus(404).includes("not be found"), "404 maps to a not-found message");
assert(fallbackErrorForStatus(429).includes("rate-limited"), "429 maps to a rate-limit message");
assert(
  fallbackErrorForStatus(503).includes("temporarily unavailable"),
  "503 maps to a service-unavailable message"
);
assert(fallbackErrorForStatus(400).includes("invalid request"), "400 maps to a validation message");
assert(fallbackErrorForStatus(500).length > 0, "500 (and any other status) maps to a non-empty generic message");
assert(
  fallbackErrorForStatus(500) === fallbackErrorForStatus(599),
  "unrecognized statuses fall back to the same generic message rather than leaking anything status-specific"
);

// --- summary -------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
