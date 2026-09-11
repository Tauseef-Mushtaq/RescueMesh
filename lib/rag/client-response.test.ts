/**
 * Focused tests for lib/rag/client-response.ts (the pure logic behind
 * the "Ask RescueMesh" page, M13).
 *
 * No test framework is installed in this project yet (same situation
 * documented in HANDOFF_M06.md for lib/scoring/priority.ts), so this
 * follows that same convention: a small self-running assertion script
 * that exits non-zero on failure.
 *
 * Run with: npx tsx lib/rag/client-response.test.ts
 */

import {
  MAX_QUERY_LENGTH,
  fallbackErrorForStatus,
  isRagSuccessData,
  isValidQuestion,
} from "./client-response";

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

// --- isValidQuestion ---------------------------------------------------

assert(isValidQuestion("What should I do during an earthquake?") === true, "non-empty question within limit is valid");
assert(isValidQuestion("") === false, "empty string is invalid");
assert(isValidQuestion("   ") === false, "whitespace-only string is invalid (test 1: empty query validation)");
assert(isValidQuestion("a".repeat(MAX_QUERY_LENGTH)) === true, "exactly MAX_QUERY_LENGTH chars is valid");
assert(isValidQuestion("a".repeat(MAX_QUERY_LENGTH + 1)) === false, "over MAX_QUERY_LENGTH chars is invalid (test 2: length limit)");
assert(isValidQuestion("  padded question  ") === true, "leading/trailing whitespace is trimmed before checking");

// --- isRagSuccessData (test 13: malformed response handling) -----------

assert(
  isRagSuccessData({
    answer: "Stay calm and move to open ground.",
    sources: [{ title: "Earthquake Safety", slug: "earthquake-safety", category: "earthquake" }],
    knowledgeFound: true,
    retrievedChunks: 5,
  }) === true,
  "well-formed knowledgeFound:true payload is recognized (test 3: knowledgeFound = true rendering precondition)"
);

assert(
  isRagSuccessData({
    answer: "I couldn't find enough verified RescueMesh knowledge to answer that safely.",
    sources: [],
    knowledgeFound: false,
    retrievedChunks: 0,
  }) === true,
  "well-formed knowledgeFound:false payload is recognized (test 6: knowledgeFound = false rendering precondition; test 7: empty sources)"
);

assert(isRagSuccessData(null) === false, "null is rejected");
assert(isRagSuccessData(undefined) === false, "undefined is rejected");
assert(isRagSuccessData("a string") === false, "a bare string is rejected");
assert(isRagSuccessData({}) === false, "empty object is rejected");
assert(
  isRagSuccessData({ answer: "ok", sources: [], knowledgeFound: true }) === false,
  "missing retrievedChunks is rejected"
);
assert(
  isRagSuccessData({ answer: "ok", sources: "not-an-array", knowledgeFound: true, retrievedChunks: 1 }) === false,
  "non-array sources is rejected"
);
assert(
  isRagSuccessData({ answer: 42, sources: [], knowledgeFound: true, retrievedChunks: 1 }) === false,
  "non-string answer is rejected"
);
assert(
  isRagSuccessData({ answer: "ok", sources: [], knowledgeFound: "yes", retrievedChunks: 1 }) === false,
  "non-boolean knowledgeFound is rejected"
);

// --- fallbackErrorForStatus (tests 8-10: 400/429/500/502/503 mapping) --

assert(fallbackErrorForStatus(429).includes("too quickly"), "429 maps to a rate-limit message");
assert(fallbackErrorForStatus(503).includes("temporarily unavailable"), "503 maps to a service-unavailable message");
assert(fallbackErrorForStatus(502).length > 0, "502 maps to a non-empty message");
assert(fallbackErrorForStatus(400).includes("valid question"), "400 maps to a validation message");
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
