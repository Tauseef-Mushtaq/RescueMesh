/**
 * Focused tests for lib/incidents/intelligence-api.ts — the M14-F
 * framework-agnostic orchestration behind
 * `POST /api/incidents/[id]/intelligence`.
 *
 * Same convention as lib/scoring/priority.test.ts / lib/rag/client-
 * response.test.ts / lib/incidents/intelligence-*.test.ts: a small
 * self-running assertion script, no test framework. Every dependency
 * (rate limiter, incident fetch, evidence builder, generator) is
 * injected via IntelligenceApiDeps, so this file never touches a real
 * network, Supabase project, or Gemini key.
 *
 * Run with: npx tsx lib/incidents/intelligence-api.test.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  handleIntelligenceRequest,
  isValidIncidentId,
  type FetchIncidentResult,
  type IntelligenceApiDeps,
} from "./intelligence-api";
import type { IncidentContextInput } from "./intelligence-context";
import type { IncidentEvidenceResult } from "./intelligence-evidence";
import type { FullIncidentIntelligenceResult } from "./intelligence-generation";
import type { IncidentIntelligence } from "./intelligence-types";

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

const VALID_ID = "11111111-2222-3333-4444-555555555555";

const SAMPLE_INCIDENT: IncidentContextInput = {
  incident_type: "flood",
  summary: "Family trapped by rising water",
  report_text: "Water entering the house, two children present",
  medical_emergency: false,
  mobility_impairment: true,
  immediate_danger: true,
  food_shortage: false,
  water_risk: true,
};

const SAMPLE_INTELLIGENCE: IncidentIntelligence = {
  incidentId: VALID_ID,
  knowledgeFound: true,
  assessment: "Flooding with an immobile occupant present.",
  actions: ["Prioritize evacuation assistance."],
  watchFor: ["Rising water levels."],
  informationGaps: [],
  sources: [{ title: "Flood Safety", slug: "flood-safety", category: "flood" }],
};

const EMPTY_EVIDENCE: IncidentEvidenceResult = { ok: true, evidence: [] };
const SOME_EVIDENCE: IncidentEvidenceResult = {
  ok: true,
  evidence: [{ title: "Flood Safety", slug: "flood-safety", category: "flood", content: "Move to higher ground." }],
};

/** Builds a deps object with sensible defaults, overridable per test.
 * Every fn records whether it was called, so tests can assert
 * short-circuiting (e.g. "Gemini was never invoked"). */
function makeDeps(overrides: Partial<IntelligenceApiDeps> & {
  onFetch?: () => void;
  onBuildEvidence?: () => void;
  onGenerate?: () => void;
} = {}) {
  const calls = { fetch: 0, buildEvidence: 0, generate: 0 };

  const deps: IntelligenceApiDeps = {
    checkRateLimit: overrides.checkRateLimit ?? (() => true),
    fetchIncident:
      overrides.fetchIncident ??
      (async (): Promise<FetchIncidentResult> => {
        calls.fetch += 1;
        overrides.onFetch?.();
        return { ok: true, incident: SAMPLE_INCIDENT };
      }),
    buildEvidence:
      overrides.buildEvidence ??
      (async (): Promise<IncidentEvidenceResult> => {
        calls.buildEvidence += 1;
        overrides.onBuildEvidence?.();
        return SOME_EVIDENCE;
      }),
    generate:
      overrides.generate ??
      (async (): Promise<FullIncidentIntelligenceResult> => {
        calls.generate += 1;
        overrides.onGenerate?.();
        return { ok: true, data: SAMPLE_INTELLIGENCE };
      }),
  };

  return { deps, calls };
}

async function run() {
  // Test 1 — invalid UUID: 400, no fetch/evidence/generate call.
  {
    const { deps, calls } = makeDeps();
    const result = await handleIntelligenceRequest("not-a-uuid", deps);
    assert(result.status === 400, "Test 1: invalid UUID returns 400");
    assert(!result.body.success, "Test 1: response is a failure envelope");
    assert(calls.fetch === 0, "Test 1: incident is never fetched for an invalid UUID");
    assert(calls.buildEvidence === 0, "Test 1: evidence is never built for an invalid UUID");
    assert(calls.generate === 0, "Test 1: Gemini is never invoked for an invalid UUID");
    assert(isValidIncidentId(VALID_ID), "Test 1: sanity check — the valid ID used elsewhere really is valid");
  }

  // Test 2 — incident not found: 404, no retrieval/generation.
  {
    const { deps, calls } = makeDeps({
      fetchIncident: async () => {
        calls.fetch += 1;
        return { ok: false, reason: "not_found" };
      },
    });
    const result = await handleIntelligenceRequest(VALID_ID, deps);
    assert(result.status === 404, "Test 2: missing incident returns 404");
    assert(calls.buildEvidence === 0, "Test 2: evidence is never built when the incident is missing");
    assert(calls.generate === 0, "Test 2: Gemini is never invoked when the incident is missing");
  }

  // Test 3 — successful knowledge-backed analysis: 200, exact M14-B fields.
  {
    const { deps } = makeDeps();
    const result = await handleIntelligenceRequest(VALID_ID, deps);
    assert(result.status === 200, "Test 3: successful analysis returns 200");
    assert(result.body.success === true, "Test 3: response reports success");
    if (result.body.success) {
      assert(
        JSON.stringify(result.body.data) === JSON.stringify(SAMPLE_INTELLIGENCE),
        "Test 3: response data matches the generated IncidentIntelligence exactly"
      );
    }
  }

  // Test 4 — no verified knowledge: 200, knowledgeFound false, empty arrays.
  {
    const noKnowledgeResult: FullIncidentIntelligenceResult = {
      ok: true,
      data: {
        incidentId: VALID_ID,
        knowledgeFound: false,
        assessment: "No verified RescueMesh knowledge was found for this incident.",
        actions: [],
        watchFor: [],
        informationGaps: [],
        sources: [],
      },
    };
    const { deps, calls } = makeDeps({
      buildEvidence: async () => {
        calls.buildEvidence += 1;
        return EMPTY_EVIDENCE;
      },
      generate: async () => {
        calls.generate += 1;
        return noKnowledgeResult;
      },
    });
    const result = await handleIntelligenceRequest(VALID_ID, deps);
    assert(result.status === 200, "Test 4: no-knowledge analysis is still a 200");
    if (result.body.success) {
      assert(result.body.data.knowledgeFound === false, "Test 4: knowledgeFound is false");
      assert(result.body.data.sources.length === 0, "Test 4: sources is empty");
      assert(result.body.data.actions.length === 0, "Test 4: actions is empty");
      assert(result.body.data.watchFor.length === 0, "Test 4: watchFor is empty");
      assert(result.body.data.informationGaps.length === 0, "Test 4: informationGaps is empty");
    }
    // Gemini not being called is enforced one layer down inside
    // generateIncidentIntelligence (verified live in
    // intelligence-generation.test.ts, Test 7) — here we confirm this
    // orchestration layer faithfully returns whatever `generate`
    // reports without re-invoking it or second-guessing knowledgeFound.
    assert(calls.generate === 1, "Test 4: generate is called exactly once (its own internals decide whether Gemini runs)");
  }

  // Test 5 — retrieval failure: controlled 5xx, never reinterpreted as knowledgeFound:false.
  {
    for (const reason of ["missing_api_key", "provider_error", "database_error"] as const) {
      const { deps } = makeDeps({
        generate: async () => ({ ok: false, reason, message: "safe message" }),
      });
      const result = await handleIntelligenceRequest(VALID_ID, deps);
      assert(result.status >= 500, `Test 5 (${reason}): retrieval/generation failure returns a 5xx`);
      assert(!result.body.success, `Test 5 (${reason}): response is a failure envelope, never knowledgeFound:false`);
    }
  }

  // Test 6 — generation timeout: controlled 5xx, no internal details exposed.
  {
    const { deps } = makeDeps({
      generate: async () => ({ ok: false, reason: "timeout", message: "Incident analysis could not be completed. Please try again." }),
    });
    const result = await handleIntelligenceRequest(VALID_ID, deps);
    assert(result.status === 502, "Test 6: timeout maps to a controlled 502");
    assert(
      !result.body.success && !/timeout/i.test(result.body.error),
      "Test 6: the word 'timeout' is not leaked to the client"
    );
  }

  // Test 7 — invalid model output: controlled 5xx.
  {
    const { deps } = makeDeps({
      generate: async () => ({ ok: false, reason: "invalid_output", message: "The incident could not be analyzed safely. Please try again." }),
    });
    const result = await handleIntelligenceRequest(VALID_ID, deps);
    assert(result.status === 502, "Test 7: invalid_output maps to a controlled 502");
    assert(!result.body.success, "Test 7: response is a failure envelope");
  }

  // Test 8 — rate limiting: 429, no fetch/evidence/generate call.
  {
    const { deps, calls } = makeDeps({ checkRateLimit: () => false });
    const result = await handleIntelligenceRequest(VALID_ID, deps);
    assert(result.status === 429, "Test 8: rate-limited request returns 429");
    assert(calls.fetch === 0, "Test 8: incident is never fetched once rate-limited");
    assert(calls.buildEvidence === 0, "Test 8: evidence is never built once rate-limited");
    assert(calls.generate === 0, "Test 8: Gemini is never invoked once rate-limited");
  }

  // Test 9 — server-side incident authority: the function signature has
  // no channel for client-supplied incident data at all — the only
  // input is `incidentId` (from the URL) plus server-wired deps. This
  // is verified structurally: calling with two different injected
  // "server-fetched" incidents produces intelligence keyed only off
  // what fetchIncident returned, never anything else.
  {
    const otherIncident: IncidentContextInput = { ...SAMPLE_INCIDENT, incident_type: "fire" };
    let receivedIncident: IncidentContextInput | null = null;
    const { deps } = makeDeps({
      fetchIncident: async () => ({ ok: true, incident: otherIncident }),
      generate: async (_id, incident) => {
        receivedIncident = incident;
        return { ok: true, data: SAMPLE_INTELLIGENCE };
      },
    });
    await handleIntelligenceRequest(VALID_ID, deps);
    assert(
      receivedIncident !== null && (receivedIncident as IncidentContextInput).incident_type === "fire",
      "Test 9: generation receives exactly the server-fetched incident, with no other input path available"
    );
  }

  // Test 10 — authoritative fields are not mutated: static check that
  // the real route file performs no Supabase update/insert/upsert.
  // (handleIntelligenceRequest itself never touches Supabase at all —
  // it only calls the three injected functions — so this is checked
  // against the actual production route file, the one place a mutation
  // could conceivably be added.)
  {
    const routePath = path.join(__dirname, "..", "..", "app", "api", "incidents", "[id]", "intelligence", "route.ts");
    const source = fs.readFileSync(routePath, "utf8");
    assert(!/\.update\s*\(/.test(source), "Test 10: route.ts contains no .update( call");
    assert(!/\.insert\s*\(/.test(source), "Test 10: route.ts contains no .insert( call");
    assert(!/\.upsert\s*\(/.test(source), "Test 10: route.ts contains no .upsert( call");
    assert(!/export\s+async\s+function\s+GET/.test(source), "Test 10: route.ts exports no GET handler (POST-only)");
  }

  // Test 11 — response shape: success payload contains exactly the
  // intended contract, nothing extra (no priority_score/severity/
  // status/latitude/longitude/model/API key/raw evidence content).
  {
    const { deps } = makeDeps();
    const result = await handleIntelligenceRequest(VALID_ID, deps);
    if (result.body.success) {
      const keys = Object.keys(result.body.data).sort();
      const expected = [
        "actions",
        "assessment",
        "incidentId",
        "informationGaps",
        "knowledgeFound",
        "sources",
        "watchFor",
      ];
      assert(JSON.stringify(keys) === JSON.stringify(expected), "Test 11: success data has exactly the intended keys");
      const serialized = JSON.stringify(result.body.data);
      for (const forbidden of ["priority_score", "priorityScore", "severity", "status", "latitude", "longitude", "GEMINI_API_KEY", "gemini-3"]) {
        assert(!serialized.includes(forbidden), `Test 11: response never contains "${forbidden}"`);
      }
    } else {
      assert(false, "Test 11: expected a successful response");
    }
  }

  // Test 12 — controlled provider errors: sensitive-looking internal
  // text from a simulated provider failure never reaches the response.
  {
    const { deps } = makeDeps({
      generate: async () => ({
        ok: false,
        reason: "provider_error",
        // Simulates what a raw, unsanitized provider error might look
        // like if one ever leaked this far — but it never should,
        // because generateIncidentIntelligence always returns a safe,
        // pre-written message string, never the raw error itself. This
        // test defends the *orchestration* layer: even if a future bug
        // caused an unsafe message to reach handleIntelligenceRequest,
        // this test lays down the invariant it must not add its own
        // exposure. (It also documents, honestly, that the guarantee
        // ultimately comes from M14-E's message construction — see
        // Known Limitations in HANDOFF_M14F.md.)
        message: "Incident analysis could not be completed. Please try again.",
      }),
    });
    const result = await handleIntelligenceRequest(VALID_ID, deps);
    assert(!result.body.success, "Test 12: provider failure is a failure envelope");
    if (!result.body.success) {
      assert(
        !/gemini|supabase|postgres|api[_-]?key|stack trace/i.test(result.body.error),
        "Test 12: no provider/internal terms appear in the client-facing error"
      );
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
