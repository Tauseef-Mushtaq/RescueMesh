/**
 * Focused tests for lib/incidents/intelligence-evidence.ts (M14-D).
 *
 * Self-running assertion script, matching the established convention
 * (`lib/scoring/priority.test.ts`, `lib/rag/client-response.test.ts`,
 * `lib/incidents/intelligence-category.test.ts`,
 * `lib/incidents/intelligence-context.test.ts`). No test framework.
 *
 * Run with: npx tsx lib/incidents/intelligence-evidence.test.ts
 */

import {
  selectIncidentKnowledge,
  buildIncidentEvidence,
  type IncidentKnowledgeEvidence,
} from "./intelligence-evidence";
import type { RetrievalResult, RetrievedChunk } from "@/lib/rag/retrieval";
import type { IncidentContextInput } from "./intelligence-context";

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

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: "chunk-1",
    sourceId: "source-1",
    content: "Move to higher ground immediately during flash flooding.",
    chunkIndex: 0,
    similarity: 0.71,
    documentId: "doc-1",
    title: "Flood Response Basics",
    slug: "flood-response-basics",
    category: "flood",
    language: "English",
    ...overrides,
  };
}

function baseIncident(overrides: Partial<IncidentContextInput> = {}): IncidentContextInput {
  return {
    incident_type: null,
    summary: null,
    report_text: "",
    medical_emergency: false,
    mobility_impairment: false,
    immediate_danger: false,
    food_shortage: false,
    water_risk: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Test 1 — successful evidence
// ---------------------------------------------------------------------
{
  const retrieval: RetrievalResult = { ok: true, data: [chunk()] };
  const result = selectIncidentKnowledge(retrieval);

  assert(result.ok === true, "Test 1: successful retrieval maps to ok:true");
  if (result.ok) {
    assert(result.evidence.length === 1, "Test 1: one chunk in -> one evidence item out");
    assert(
      result.evidence[0].content === chunk().content,
      "Test 1: evidence content matches chunk content",
    );
  }
}

// ---------------------------------------------------------------------
// Test 2 — empty retrieval stays a successful empty evidence set
// ---------------------------------------------------------------------
{
  const retrieval: RetrievalResult = { ok: true, data: [] };
  const result = selectIncidentKnowledge(retrieval);

  assert(result.ok === true, "Test 2: empty retrieval is still ok:true");
  if (result.ok) {
    assert(result.evidence.length === 0, "Test 2: empty retrieval -> empty evidence array");
  }
}

// ---------------------------------------------------------------------
// Test 3 — retrieval failure stays a failure, reason preserved
// ---------------------------------------------------------------------
{
  const retrieval: RetrievalResult = {
    ok: false,
    reason: "database_error",
    message: "Unable to search knowledge base.",
  };
  const result = selectIncidentKnowledge(retrieval);

  assert(result.ok === false, "Test 3: retrieval failure stays ok:false");
  if (!result.ok) {
    assert(result.reason === "database_error", "Test 3: original reason preserved exactly");
    assert(
      result.message === "Unable to search knowledge base.",
      "Test 3: original message preserved exactly",
    );
  }

  // Also verify a *different* reason is not conflated with database_error.
  const providerFailure: RetrievalResult = {
    ok: false,
    reason: "provider_error",
    message: "Embedding provider unavailable.",
  };
  const providerResult = selectIncidentKnowledge(providerFailure);
  assert(
    !providerResult.ok && providerResult.reason === "provider_error",
    "Test 3: provider_error stays distinguishable from database_error",
  );
}

// ---------------------------------------------------------------------
// Test 4 — source provenance preserved exactly, including nulls
// ---------------------------------------------------------------------
{
  const withMetadata = chunk({
    title: "Earthquake Safety",
    slug: "earthquake-safety",
    category: "earthquake",
  });
  const withoutMetadata = chunk({
    id: "chunk-2",
    title: null,
    slug: null,
    category: null,
  });

  const result = selectIncidentKnowledge({
    ok: true,
    data: [withMetadata, withoutMetadata],
  });

  assert(result.ok === true, "Test 4: retrieval succeeds");
  if (result.ok) {
    const [a, b] = result.evidence;
    assert(a.title === "Earthquake Safety", "Test 4: title preserved when present");
    assert(a.slug === "earthquake-safety", "Test 4: slug preserved when present");
    assert(a.category === "earthquake", "Test 4: category preserved when present");
    assert(b.title === null, "Test 4: null title preserved as null (not fabricated)");
    assert(b.slug === null, "Test 4: null slug preserved as null");
    assert(b.category === null, "Test 4: null category preserved as null");
  }
}

// ---------------------------------------------------------------------
// Test 5 — knowledge content preserved verbatim
// ---------------------------------------------------------------------
{
  const longContent =
    "Ensure evacuation routes remain clear. Do not attempt to drive through " +
    "moving water. Coordinate with local shelters for displaced residents.";
  const result = selectIncidentKnowledge({
    ok: true,
    data: [chunk({ content: longContent })],
  });

  assert(result.ok === true, "Test 5: retrieval succeeds");
  if (result.ok) {
    assert(
      result.evidence[0].content === longContent,
      "Test 5: content is copied verbatim, not paraphrased/modified",
    );
  }
}

// ---------------------------------------------------------------------
// Test 6 — no invented metadata on the evidence objects
// ---------------------------------------------------------------------
{
  const result = selectIncidentKnowledge({ ok: true, data: [chunk()] });
  assert(result.ok === true, "Test 6: retrieval succeeds");
  if (result.ok) {
    const keys = Object.keys(result.evidence[0]).sort();
    assert(
      keys.join(",") === "category,content,slug,title",
      `Test 6: evidence object has exactly {title, slug, category, content} — got [${keys.join(", ")}]`,
    );
    // Specifically confirm nothing from the wider RetrievedChunk (id,
    // sourceId, chunkIndex, similarity, documentId, language) leaked
    // through, and no invented field (url/author/date/agency/confidence)
    // exists either.
    const forbidden = [
      "id",
      "sourceId",
      "chunkIndex",
      "similarity",
      "documentId",
      "language",
      "url",
      "author",
      "publicationDate",
      "agency",
      "confidence",
      "score",
      "verificationStatus",
    ];
    for (const key of forbidden) {
      assert(
        !(key in (result.evidence[0] as unknown as Record<string, unknown>)),
        `Test 6: evidence does not contain invented/internal field "${key}"`,
      );
    }
  }
}

// ---------------------------------------------------------------------
// Test 7 — category behavior from M14-C is unchanged / correctly wired
// ---------------------------------------------------------------------
async function testCategoryWiring() {
  let receivedCategory: string | undefined;
  const fakeRetrieve = async (
    _query: string,
    options?: { category?: string },
  ): Promise<RetrievalResult> => {
    receivedCategory = options?.category;
    return { ok: true, data: [] };
  };

  await buildIncidentEvidence(
    baseIncident({ incident_type: "flood" }),
    fakeRetrieve as unknown as typeof import("@/lib/rag/retrieval").retrieveRelevantChunks,
  );
  assert(
    receivedCategory === "flood",
    "Test 7: a mapped incident_type is still passed through to retrieval as category (M14-C behavior unchanged)",
  );

  receivedCategory = "unset";
  await buildIncidentEvidence(
    baseIncident({ incident_type: "other" }),
    fakeRetrieve as unknown as typeof import("@/lib/rag/retrieval").retrieveRelevantChunks,
  );
  assert(
    receivedCategory === undefined,
    "Test 7: incident_type \"other\" still omits category (never mapped to \"general\")",
  );
}

// ---------------------------------------------------------------------
// Test 8 — multiple chunks from the same source are preserved
// ---------------------------------------------------------------------
{
  const chunkA = chunk({ id: "a", chunkIndex: 0, content: "First relevant passage." });
  const chunkB = chunk({ id: "b", chunkIndex: 1, content: "Second relevant passage." });
  const result = selectIncidentKnowledge({ ok: true, data: [chunkA, chunkB] });

  assert(result.ok === true, "Test 8: retrieval succeeds");
  if (result.ok) {
    assert(
      result.evidence.length === 2,
      "Test 8: two distinct chunks from the same source document are both preserved",
    );
  }

  // But an exact duplicate row (same id) is defensively de-duplicated.
  const duplicateResult = selectIncidentKnowledge({
    ok: true,
    data: [chunkA, chunk({ id: "a", content: "First relevant passage." })],
  });
  assert(
    duplicateResult.ok === true && duplicateResult.evidence.length === 1,
    "Test 8: an exact duplicate chunk id collapses to one evidence item",
  );
}

// ---------------------------------------------------------------------
// Test 9 — bounded evidence: no additional truncation is applied here
// ---------------------------------------------------------------------
{
  // Explicitly documents/verifies the "no new bound" decision: evidence
  // length always equals retrieved-chunk length (topK/chunk-size bounds
  // are relied on from M12, not re-implemented here), and content length
  // is never shortened relative to the source chunk.
  const chunks: RetrievedChunk[] = Array.from({ length: 5 }, (_, i) =>
    chunk({ id: `chunk-${i}`, content: "x".repeat(2000) }),
  );
  const result = selectIncidentKnowledge({ ok: true, data: chunks });

  assert(result.ok === true, "Test 9: retrieval succeeds");
  if (result.ok) {
    assert(
      result.evidence.length === chunks.length,
      "Test 9: evidence count exactly equals retrieved chunk count (no extra truncation of the list)",
    );
    assert(
      result.evidence.every((e: IncidentKnowledgeEvidence) => e.content.length === 2000),
      "Test 9: individual chunk content length is not truncated by this module",
    );
  }
}

async function main() {
  await testCategoryWiring();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
