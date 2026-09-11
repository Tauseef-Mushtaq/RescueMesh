/**
 * Focused tests for lib/incidents/intelligence-category.ts (M14-B).
 *
 * No test framework is installed in this project yet (same situation
 * documented in HANDOFF_M06.md for lib/scoring/priority.ts and
 * HANDOFF_M13.md for lib/rag/client-response.ts), so this follows that
 * same convention: a small self-running assertion script that exits
 * non-zero on failure.
 *
 * Run with: npx tsx lib/incidents/intelligence-category.test.ts
 */

import { mapIncidentTypeToKnowledgeCategory } from "./intelligence-category";
import type { IncidentType } from "@/lib/supabase/types";

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

// --- direct 1:1 mappings -------------------------------------------------

const directMappings: IncidentType[] = [
  "flood",
  "earthquake",
  "fire",
  "building_collapse",
  "medical_emergency",
  "missing_person",
  "road_blockage",
  "food_shortage",
  "shelter_need",
];

for (const type of directMappings) {
  assert(
    mapIncidentTypeToKnowledgeCategory(type) === type,
    `"${type}" maps directly to the identically-named knowledge category`
  );
}

// --- no-mapping cases ------------------------------------------------------

assert(
  mapIncidentTypeToKnowledgeCategory("other") === null,
  '"other" has no knowledge-category mapping (must not be mapped to "general")'
);
assert(
  mapIncidentTypeToKnowledgeCategory(null) === null,
  "null incident type has no knowledge-category mapping"
);

// --- summary -------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
