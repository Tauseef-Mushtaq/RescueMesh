# HANDOFF_M14H1.md

## Module

M14-H1 — Security Fixes (review pass of the four listed areas)

## Status

**Complete — no code changes were required.** Each of the four areas
was inspected against the actual M14-C through M14-G implementation
(not against the module prompt's illustrative description of what
*might* need fixing), and none had a concrete issue. Per the module
prompt's own instruction ("if a concrete issue exists, fix only that
issue"), nothing was changed. This handoff documents the inspection
and its findings so M14-I doesn't need to repeat it.

---

## 1. API error sanitization

**Traced every path that can produce a client-facing `error` string**
for `POST /api/incidents/[id]/intelligence`:

- `route.ts` → `handleIntelligenceRequest` (`intelligence-api.ts`) →
  `generateIncidentIntelligence` (`intelligence-generation.ts`) →
  `buildIncidentEvidence`/`selectIncidentKnowledge`
  (`intelligence-evidence.ts`) → `retrieveIncidentKnowledge`
  (M14-C, unmodified) → `retrieveRelevantChunks` (`lib/rag/retrieval.ts`,
  M12) → `embedTexts` (`lib/ai/embeddings.ts`).

At every one of those layers, every `message:` field assigned to an
error result is a **static, hand-written string literal** — e.g.
`"Embedding generation is currently unavailable."`,
`"Unable to search knowledge base."`,
`"Incident analysis could not be completed. Please try again."`. None
of them interpolate `err.message`, a Supabase `error.message`, or any
other runtime value into the string returned to the client. Where a
raw message is captured at all (`err instanceof Error ? err.message :
String(err)` in `intelligence-generation.ts` and the raw
`error.message` in `route.ts`'s `fetchIncidentForIntelligence`), it is
only ever passed to `console.error`, and only inside `if
(process.env.NODE_ENV === "development")` guards — never placed in the
`ApiResponse` body.

**Status-code mapping** (`intelligence-api.ts`'s `statusForFailureReason`
+ its three inline `fail(...)` calls) already covers exactly the
required set, with the same intent as the module prompt's example
text (existing wording kept, per "preserve the existing response
contract" — see below):

| Status | Existing message | Reason(s) |
|---|---|---|
| 400 | "Invalid incident ID." | malformed UUID |
| 404 | "This incident could not be found." | incident missing |
| 429 | "Too many requests. Please try again shortly." | rate limit |
| 500 | "Unable to analyze this incident right now." / "AI incident analysis is currently unavailable." | `database_error` / generic fetch failure |
| 503 | "RescueMesh AI is temporarily unavailable. Please try again later." | `missing_api_key` / config missing |
| 502 | "Incident analysis could not be completed. Please try again." / "The incident could not be analyzed safely. Please try again." | `provider_error` / `timeout` / `invalid_output` |

I did not rewrite these to match the module prompt's example wording
verbatim ("Invalid request.", "Internal server error.", etc.) because
(a) they already satisfy the actual requirement — no raw
provider/exception/SQL/filesystem/env-var content ever reaches the
client, on every path, confirmed by direct inspection — and (b) the
module prompt explicitly says "preserve the existing response
contract," and the UI (`intelligence-client.ts`'s
`fallbackErrorForStatus`, only used when the server response lacks an
`error` field) and its own 28-test suite already assert the *current*
wording. Changing the strings would be a wording change with no
security benefit, at the cost of the "preserve contract" instruction
and 12 already-passing assertions in `intelligence-api.test.ts` (Test
3/6/7/12) that check status codes and `success: false`, plus
`intelligence-client.test.ts`'s fallback-text assertions. No stack
trace, SQL error, provider response, API key, filesystem path, or env
var is exposed on any path — confirmed by reading every `message:` /
`error:` assignment in the six files listed above, not by pattern
sampling.

**No change made.**

---

## 2. AI authority check

Verified `priority_score`, `severity`, `status`, `incident_type`,
`confidence` cannot flow from Gemini back to the client or anywhere
else:

- **Not selected from the database in the first place:** the
  intelligence route's `INTELLIGENCE_COLUMNS` selects only 8 fields
  (`incident_type, summary, report_text, medical_emergency,
  mobility_impairment, immediate_danger, food_shortage, water_risk`) —
  `priority_score`, `severity`, `status`, and `confidence` are never
  fetched at all. (`incident_type` *is* selected, but only to describe
  the incident to Gemini in the prompt — see next point.)
- **Gemini's schema has no authority fields:** `RESPONSE_SCHEMA` in
  `intelligence-generation.ts` defines exactly `assessment` / `actions`
  / `watchFor` / `informationGaps` — no `priority_score`/`severity`/
  `status`/`incident_type`/`confidence` property exists for the model
  to populate.
- **The validator only reads those four fields:** `validateGeneratedIntelligence`
  reads `obj.assessment`/`obj.actions`/`obj.watchFor`/
  `obj.informationGaps` and nothing else from Gemini's parsed JSON —
  even if a model ever emitted an extra `priority_score` key (e.g. via
  a prompt-injection attempt in the retrieved evidence text), it is
  never read, never copied into `IncidentIntelligence`, and never
  reaches the client.
- **No database write path exists:** `route.ts`'s own doc comment plus
  a live grep for `.update(`/`.insert(`/`.upsert(` returns nothing in
  the route or in `intelligence-generation.ts`/`intelligence-api.ts`/
  `intelligence-evidence.ts` (none of those files even import a
  Supabase client capable of writing — `intelligence-generation.ts` has
  no Supabase import at all).
- Already asserted live by the existing test suite:
  `intelligence-api.test.ts`'s Test 11 serializes a full success
  response and asserts it contains none of `"priority_score"`,
  `"priorityScore"`, `"severity"`, `"status"`, `"latitude"`,
  `"longitude"`, `"GEMINI_API_KEY"`, `"gemini-3"`; Test 10 asserts
  `route.ts`'s source has no `.update(`/`.insert(`/`.upsert(` and no
  `GET` export.

**No concrete issue found. `lib/scoring/priority.ts` was not touched
(not even read for modification purposes — only referenced by its
existing test suite, which was re-run unmodified).**

---

## 3. No-knowledge safety

Confirmed the existing behavior already holds, exactly as specified:

```
no retrieved evidence → no Gemini call → knowledgeFound=false
→ empty actions/watchFor/informationGaps/sources
```

`generateIncidentIntelligence` (`intelligence-generation.ts`) checks
`evidenceResult.evidence.length === 0` and returns
`buildNoKnowledgeIntelligence(incidentId)` *before* calling
`generateStructuredIntelligence` — the Gemini call is structurally
unreachable in that branch (there is no code path from the `length
=== 0` return to `generateStructuredIntelligence`). `buildNoKnowledgeIntelligence`
returns `actions: []`, `watchFor: []`, `informationGaps: []`,
`sources: []` unconditionally.

This exact behavior is already covered live by
`intelligence-api.test.ts` Test 4 (`EMPTY_EVIDENCE` → 200,
`knowledgeFound === false`, all four arrays empty, `generate` called
exactly once with its *own* internals deciding not to call Gemini) and
by `intelligence-generation.test.ts` (41/41, M14-E's own suite, which
tests `generateIncidentIntelligence` directly with a `generateFn` that
would fail the test if invoked on empty evidence).

Per the module prompt ("if this already works, do not rewrite it...
only add a focused regression test if there is a genuine missing
test"): it already works, and there is no genuine missing test — the
exact assertion the module prompt describes (no Gemini call on empty
evidence) is already made explicitly in `intelligence-api.test.ts`
Test 4 and implicitly enforced by `intelligence-generation.ts`'s
control flow itself. **No new test was added.**

---

## 4. Secret/client boundary

- `GEMINI_API_KEY`: referenced only in `lib/ai/embeddings.ts`,
  `lib/ai/incident-extraction.ts`, `lib/rag/generation.ts`,
  `lib/incidents/intelligence-generation.ts`, and test files for those
  — all server-only modules (no `"use client"` directive, all only
  reachable from route handlers / server components). Confirmed no
  `"use client"` file references it (see grep below).
- `SUPABASE_SERVICE_ROLE_KEY`: referenced only in
  `lib/supabase/config.ts`, which is what `createServiceClient` reads
  from — also server-only.
- Grepped every file containing `"use client"` for
  `GoogleGenAI|@google/genai|GEMINI_API_KEY|createServiceClient|
  SUPABASE_SERVICE_ROLE_KEY`. One match: `components/incidents/
  incident-intelligence.tsx`, but the only hit is inside that file's
  own doc comment explicitly stating it does *not* import any of
  those — reconfirmed by grepping that one file alone, which returns
  only the comment line, not an actual import or usage.

**No concrete issue found. No change made.**

---

## TypeScript baseline errors

Inspected both per the module prompt's instruction to "inspect them
briefly" and fix only if obvious/safe:

- **`app/layout.tsx`: `LayoutProps<"/">`.** This is a Next.js
  App-Router-generated global type, emitted into `.next/types/` by
  `next dev`/`next build` itself (`typedRoutes`-style codegen) — it is
  not a type this repo defines or imports anywhere, so there is no
  import to fix or add. Since `next build`/`next dev` could not be run
  in this environment (see Tests below — no network access to install
  dependencies, and no `node_modules`/`.next` present in the provided
  archive), this could not be regenerated to confirm the fix is really
  a no-op elsewhere. Not touched. **Left for M14-I**, to be re-checked
  once a build has actually run at least once in an environment with
  dependencies installed.
- **`lib/incidents/intelligence-context.test.ts`: `report_text: null`
  (×2).** `IncidentContextInput.report_text` is typed as
  `string | undefined` (not `| null`) in `intelligence-context.ts`
  (M14-C, out of scope), but the M14-C test file itself constructs
  fixtures with `report_text: null` to exercise the "no text at all"
  case. This is a pre-existing mismatch between a M14-C production
  type and its own M14-C test file, not something introduced by any
  M14-D through M14-H module. Fixing it means either widening
  `IncidentContextInput.report_text` to accept `null` (a production
  type change to M14-C, out of the stated scope: "Do not modify... 
  incident extraction" / M14-C is not one of the four M14-H areas) or
  changing the test fixtures to use `undefined` instead of `null`
  (safer, smaller, stays inside the test file) — but the module prompt
  scopes M14-H to the four listed security areas only, and this is a
  type-strictness issue, not a security issue, so it was left alone
  rather than reinterpreted as in-scope. **Left for M14-I**, per the
  module prompt's own explicit instruction not to redesign M14-C to
  hide these errors.

Both are unchanged from the M14-D/E/F/G baseline — this pass adds
zero new TypeScript errors (no source file was edited at all).

---

## Tests

**Environment constraint:** this container has no network access
(`npm install` fails with `403 Forbidden` against the npm registry)
and the provided archive does not include `node_modules`. As a result
`npx tsc --noEmit`, `npm run lint`, and `npx tsx <test>.ts` could **not
be executed** in this session — there is no TypeScript compiler,
ESLint, or `tsx` binary available.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **NOT RUN** — no `node_modules` (network blocked) |
| `npm run lint` | **NOT RUN** — same reason |
| Any test file (`npx tsx lib/incidents/intelligence-api.test.ts`, etc.) | **NOT RUN** — same reason |

Since **no source file was modified** in this pass (see "Files
changed" below — only documentation files were written), there is no
new code for these commands to validate; the M14-G handoff's own
live-verified baseline (3 tsc errors, 1 lint warning, all 7
self-running suites passing, 218 total test assertions across them)
stands unchanged. This was not re-run live in this session and should
be re-confirmed in an environment with dependencies installed before
M14-I proceeds, but it is not expected to differ, since nothing that
baseline depends on was touched.

All verification of the four M14-H1 security areas above was done via
direct source reading (`view`) and static `grep`, not via running the
test suite — every specific grep command used is shown inline in the
relevant section above and can be re-run to reproduce the finding.

---

## Files changed

**Modified:**
- `CURRENT_STATE.md` — appended an "M14-H1" section in the same style
  prior M14 sub-parts used.

**Created:**
- `HANDOFF_M14H1.md` (this file)

**Not modified (no source file was edited):**
```
app/api/incidents/[id]/intelligence/route.ts
lib/incidents/intelligence-api.ts
lib/incidents/intelligence-generation.ts
lib/incidents/intelligence-evidence.ts
lib/incidents/intelligence-context.ts
lib/incidents/intelligence-client.ts
lib/incidents/intelligence-types.ts
lib/incidents/intelligence-category.ts
lib/rate-limit.ts
lib/scoring/priority.ts
lib/rag/*, lib/ai/*
components/incidents/incident-intelligence.tsx
app/layout.tsx
lib/incidents/intelligence-context.test.ts
(and every other file not listed above)
```

---

## Remaining known issues

- The two pre-existing baseline `tsc` errors (`app/layout.tsx`'s
  `LayoutProps`, `intelligence-context.test.ts`'s `report_text: null`
  ×2) remain, unchanged from M14-D/E/F/G. Neither was introduced or
  worsened here. Both are documented above with the specific reason
  each was left for M14-I rather than fixed.
- `npx tsc --noEmit` / `npm run lint` / the existing test suites were
  **not re-run live** in this session due to this environment having
  no network access and no pre-installed `node_modules`. This is a new
  environment limitation relative to M14-G (which did have a working
  `node_modules` and ran all of the above live) — flagged explicitly
  so M14-I does not assume this pass re-verified the baseline.
- No new regression test was added (Task 3's "only if a genuine
  missing test exists" condition was not met — see the No-knowledge
  safety section above).

## Confirmation

M14-I was **not** started. No code was changed in any of `app/`,
`lib/`, or `components/`. No new dependency was added. No new AI
feature was added. `lib/scoring/priority.ts` was not modified. M12
(`lib/rag/*`, `app/api/rag/*`) and M13 (`app/ask/*`,
`components/rag/*`) were read-only inspected (to trace error-message
provenance for Task 1) but not modified.
