# HANDOFF_M14F.md

## Module

M14-F — Secure Intelligence API

## Status

Complete

## Endpoint

```
POST /api/incidents/[id]/intelligence
```

No GET handler exists on this route. No request body is read.

## Implementation

**UUID validation.** `isValidIncidentId()` in the new
`lib/incidents/intelligence-api.ts` reuses the exact same
`UUID_PATTERN` regex found in `app/api/incidents/[id]/route.ts`,
redeclared locally rather than extracted into a shared util — matching
that file's own existing convention (a local regex per route) rather
than refactoring a stable, untouched file just to share one constant.

**Server-side incident fetch.** `fetchIncidentForIntelligence()` in the
route file uses `createServiceClient()` (the same server-only pattern as
every other `app/api/incidents/**` route) and selects exactly:

```
incident_type, summary, report_text, medical_emergency,
mobility_impairment, immediate_danger, food_shortage, water_risk
```

— the 8 fields `IncidentContextInput` (M14-C) requires. It never selects
`id`, `latitude`/`longitude`, `priority_score`, `severity`, `status`, or
`confidence`. The incident ID used in the final response comes from the
URL param (`params.id`), not from this row. No HTTP call to the
application's own `/api/incidents/[id]` route is made — this is a direct
Supabase query, per the module prompt's explicit instruction.

**M14-C/D/E integration.** The route does not duplicate any context-
building, category-mapping, retrieval, evidence-selection, prompt-
construction, or generation logic. It calls exactly:

```ts
const evidenceResult = await buildIncidentEvidence(incident);       // M14-D
const result = await generateIncidentIntelligence(id, incident, evidenceResult); // M14-E
```

using the real exported function signatures discovered by inspection
(`lib/incidents/intelligence-evidence.ts`,
`lib/incidents/intelligence-generation.ts`) — not the module prompt's
illustrative pseudocode verbatim.

**Rate limiting.** Reuses `checkRateLimit`/`getClientKey` from
`lib/rate-limit.ts` unchanged (same in-memory, per-process, non-
distributed limiter already used by `/api/rag` and `/api/rag/ingest` —
that limitation is not new here). Key: `` `intelligence:${clientKey}` ``.
Limit: **5 requests / 60 seconds per client**, checked before UUID
validation, before the incident fetch, and before any retrieval/Gemini
work. Chosen more conservatively than `/api/rag`'s 20/min because one
intelligence request can invoke up to 3 sequential Gemini model attempts
(`lib/incidents/intelligence-generation.ts`'s `MODEL_CHAIN`, 25s timeout
each) versus RAG's single embed+generate call — documented in-file at
the route's `RATE_LIMIT`/`RATE_WINDOW_MS` constants.

**Authentication/access model actually found.** Inspected the existing
codebase for an auth system before implementing anything: there is
**none**. Every existing incident-related route
(`/api/incidents`, `/api/incidents/[id]`, `/api/rag`) is reachable
without authentication, using the service-role Supabase client
server-side and RLS policies that currently grant only `authenticated`
role read access (no anonymous write policies) — see
`supabase/migrations/00000000000001_initial_schema.sql`. This MVP
intentionally has no login/session system yet. M14-F does not introduce
one, per the module prompt's explicit instruction not to turn this into
an authentication project — it documents the existing model (server-only
service-role access, no user-facing auth) and does not weaken or bypass
any authorization boundary that does exist (RLS remains untouched; the
service-role client already bypasses it by design, same as every other
route since M07).

**Response envelope.** `{ success: true, data: IncidentIntelligence }` on
`200`, `{ success: false, error: string }` on every failure status —
matching the exact envelope convention every other route in this project
already uses (`/api/incidents`, `/api/incidents/[id]`, `/api/rag`).

**HTTP error mapping** (`statusForFailureReason()` in
`lib/incidents/intelligence-api.ts`, an exhaustive switch over
`IncidentIntelligenceFailureReason` with no `default` — a new reason
value added later fails `tsc` here instead of silently mapping wrong):

| Origin | Reason | Status |
|---|---|---|
| Invalid UUID | — | 400 |
| Incident fetch | not found | 404 |
| Incident fetch | Supabase config missing | 503 |
| Incident fetch | query failed | 500 |
| Retrieval/generation | `missing_api_key` | 503 |
| Retrieval/generation | `database_error` | 500 |
| Retrieval/generation | `provider_error` | 502 |
| Retrieval/generation | `timeout` | 502 |
| Retrieval/generation | `invalid_output` | 502 |
| Rate limiter | over limit | 429 |
| Final shape check | fails `isIncidentIntelligenceData` | 500 |

A retrieval failure (`missing_api_key`/`provider_error`/
`database_error`, propagated unchanged from M14-C/D) is never turned
into a `knowledgeFound: false` success — it stays a `success: false`
failure envelope with a 5xx status, exactly per module prompt section 12
vs. 13's distinction. All error messages returned to the client are the
pre-written, safe strings M14-E/M14-D/this route already produce (e.g.
"Incident analysis could not be completed. Please try again.") — never a
raw provider/database error string.

**Runtime validation.** Before returning a success response, the route
(via `handleIntelligenceRequest`) validates `result.data` with the
existing `isIncidentIntelligenceData()` from
`lib/incidents/intelligence-client.ts` (M14-B) — reused, not
reimplemented. If it somehow fails (should not happen given M14-E's own
internal validation), the route returns a controlled `500` rather than
trusting the shape blindly.

## Security

- **Server-only Supabase service client.** `createServiceClient()` is
  called only inside the route file's `fetchIncidentForIntelligence()`,
  a server-side Route Handler. It is never imported into
  `lib/incidents/intelligence-api.ts` (which has no Supabase/Gemini
  import at all — confirmed by inspection) and never reaches the client
  bundle.
- **No client secrets.** `GEMINI_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
  literals do not appear anywhere in the new route or orchestration
  files (`grep -n "SUPABASE_SERVICE_ROLE_KEY\|GEMINI_API_KEY"` across
  both returns nothing outside the test file's own explicit "must never
  appear in the response" assertion list).
- **No coordinates to Gemini.** `latitude`/`longitude` are never selected
  by `fetchIncidentForIntelligence()`'s query and do not appear in
  `IncidentContextInput` at all (M14-C's own boundary, unmodified) — so
  there is no value for this route to accidentally forward even if it
  tried.
- **No authoritative-field mutation.** `grep -n "\.update(\|\.insert(\|
  \.upsert("` across the route file and `intelligence-api.ts` returns
  nothing. Test 10 additionally statically greps the actual production
  route file (not just the pure orchestration function) for the same
  three patterns plus confirms no `GET` export exists, so this is
  checked against the real file that will ship, not only the
  dependency-injected test harness.
- **No persistence.** Confirmed — no migration was added, no JSONB
  column was added, `IncidentIntelligence` is only ever an HTTP response
  value. Every POST performs a fresh M14-C/D/E run, per HANDOFF_M14B's
  Option B decision (reaffirmed, not revisited, by this module).
- **No automatic triggers.** No `useEffect`, scheduler, cron, or
  GET-triggered path exists anywhere in the new files (grep confirms
  no `useEffect`/`setInterval`/`cron` in either new file); the only way
  to invoke generation is an explicit `POST` to this route.
- **Rate limiter behavior.** In-memory, per-process, fixed-window,
  keyed by best-effort client IP (`x-forwarded-for`/`x-real-ip`, falling
  back to a shared `"unknown"` bucket) — same non-distributed limitation
  already documented for M12/M13's limiter, not newly introduced or
  newly hidden here.
- **No raw provider/database errors reach the client** — every failure
  branch returns one of the route's own fixed strings or the pre-written
  message M14-D/E already constructed; Test 12 specifically asserts a
  simulated `provider_error` result's message contains none of
  `gemini|supabase|postgres|api[_-]?key|stack trace`.

## Tests

All 12 required test categories are implemented in the new
`lib/incidents/intelligence-api.test.ts` (self-running assertion script,
`npx tsx` convention — no Jest/Vitest/Playwright/Cypress introduced).

| # | Test | Result |
|---|---|---|
| 1 | Invalid UUID -> 400, no fetch/evidence/generate call | **PASS** |
| 2 | Incident not found -> 404, no retrieval/generation | **PASS** |
| 3 | Successful knowledge-backed analysis -> 200, exact fields | **PASS** |
| 4 | No verified knowledge -> 200, knowledgeFound false, empty arrays | **PASS** |
| 5 | Retrieval failure (`missing_api_key`/`provider_error`/`database_error`) -> controlled 5xx, never `knowledgeFound:false` | **PASS** |
| 6 | Generation timeout -> controlled 502, no "timeout" string leaked | **PASS** |
| 7 | Invalid model output -> controlled 502 | **PASS** |
| 8 | Rate limiting -> 429, no downstream calls | **PASS** |
| 9 | Server-side incident authority (no client-data channel exists) | **PASS** |
| 10 | Authoritative fields not mutated (static grep of the real route file: no `.update`/`.insert`/`.upsert`, no `GET` export) | **PASS** |
| 11 | Response shape — exactly the intended 7 keys, no leaked internal fields | **PASS** |
| 12 | Controlled provider errors — no provider/internal terms in client-facing error | **PASS** |

Command and result, run live in this session:

```
$ npx tsx lib/incidents/intelligence-api.test.ts
49 passed, 0 failed
```

Additional verification, also run live:

```
$ npx tsc --noEmit
app/layout.tsx(11,50): error TS2304: Cannot find name 'LayoutProps'.
lib/incidents/intelligence-context.test.ts(35,5): error TS2322: Type 'null' is not assignable to type 'string'.
lib/incidents/intelligence-context.test.ts(111,56): error TS2322: Type 'null' is not assignable to type 'string | undefined'.
```
— identical to the M14-D/E-documented baseline (3 pre-existing errors,
all in files this module does not touch). **Zero new errors** from any
file this module added or modified.

```
$ npx eslint .
components/map/incident-map.tsx: 1 warning (unused eslint-disable directive)
0 errors
```
— identical pre-existing warning, unrelated to this module.

```
$ npm run build
...
Failed to type check.
lib/incidents/intelligence-context.test.ts(35,5): error TS2322: ...
lib/incidents/intelligence-context.test.ts(111,56): error TS2322: ...
```
— **fails**, for the exact same pre-existing `intelligence-context
.test.ts` reason documented since HANDOFF_M14D.md's "Known limitations."
Confirmed not caused by M14-F: the `tsc --noEmit` output above is
byte-for-byte the same set of errors whether or not this module's files
are present, and `app/layout.tsx`'s error is unrelated to any file this
module touches.

```
$ next dev  (all env vars unset)
GET /                -> 200
GET /dashboard        -> 200
GET /report            -> 200
GET /ask                -> 200
GET /api/incidents       -> 503 (unchanged, missing Supabase config)
POST /api/rag {}          -> 400 "Invalid or incomplete query." (unchanged)
POST /api/incidents/not-a-uuid/intelligence -> 400 "Invalid incident ID."
POST /api/incidents/11111111-2222-3333-4444-555555555555/intelligence
  -> 503 "RescueMesh AI is temporarily unavailable. Please try again later."
```
All live-verified in this session (no live Gemini/Supabase credentials
available, so the 503 config-missing path — not a 200 knowledge-backed
analysis — is what this environment can actually exercise end-to-end;
that specific gap is listed under Known limitations, not glossed over).

## Build

**FAIL** — for the exact pre-existing reason documented above and in
HANDOFF_M14D.md/HANDOFF_M14E.md (`lib/incidents/intelligence-context
.test.ts`'s two `report_text: null` type errors, plus the unrelated
`app/layout.tsx` `LayoutProps` error). Not introduced or worsened by
M14-F.

## Files changed

**Created:**
- `app/api/incidents/[id]/intelligence/route.ts`
- `lib/incidents/intelligence-api.ts`
- `lib/incidents/intelligence-api.test.ts`
- `HANDOFF_M14F.md` (this file)

**Modified:**
- `CURRENT_STATE.md` (appended an M14-F section; did not rewrite the
  stale M12-era header/status lines, consistent with M14-A through
  M14-E's own precedent of not rewriting that file — see the note left
  in-file for the next reader)

No other file was modified.

## Files intentionally untouched

Per module prompt section 31 and this session's own verification (no
edits attempted, and a diff-equivalent `tsc`/`eslint` baseline comparison
confirms no accidental changes):

```
lib/scoring/priority.ts, lib/scoring/priority.test.ts
lib/rag/retrieval.ts, lib/rag/generation.ts
app/api/rag/route.ts, lib/rag/client-response.ts
app/ask/*
app/api/analyze/route.ts, lib/ai/incident-extraction.ts
components/map/*
lib/incidents/intelligence-types.ts
lib/incidents/intelligence-category.ts
lib/incidents/intelligence-context.ts
lib/incidents/intelligence-evidence.ts
lib/incidents/intelligence-generation.ts
lib/incidents/intelligence-client.ts
app/api/incidents/[id]/route.ts (existing GET, unmodified)
app/incidents/[id]/page.tsx
```

## Known limitations

- **No live Gemini/Supabase credentials were available in this
  environment**, so a real `200` knowledge-backed analysis (the actual
  Gemini call succeeding end-to-end through M14-C/D/E) was not exercised
  live — consistent with the standing limitation carried since M07 per
  `CURRENT_STATE.md`. Everything up to and including the
  missing-configuration `503` path was exercised live; the
  knowledge-backed and no-knowledge success paths, and the
  retrieval/generation-failure paths, are covered by the 49
  dependency-injected unit tests instead (all of which did execute
  live).
- **`npm run build` fails**, for the pre-existing, out-of-scope reason
  documented above — not a regression, but still blocking a full
  production build today. Fixing `lib/incidents/intelligence-context
  .test.ts`'s two type errors (M14-C's file, not this module's) would
  resolve it; not done here per the module prompt's "do not fix
  unrelated problems during M14-F" instruction.
- **The rate limiter is in-memory/per-process**, not distributed —
  acceptable for this MVP (same as M12/M13's limiter) but will reset on
  every cold start / not coordinate across multiple serverless
  instances on Vercel. Not a new limitation introduced here.
- **The final client-facing error message for a provider/generation
  failure ultimately depends on M14-E's message construction always
  staying safe** (this route trusts and forwards `result.message`
  rather than re-sanitizing it). This is a reasonable trust boundary —
  M14-E's messages are already fixed, hand-written strings, never raw
  provider text (confirmed by reading `intelligence-generation.ts`) —
  but is noted here since M14-F does not independently re-scan that
  string for safety, only checked it by test with a deliberately-safe
  simulated message (Test 12).

## Explicitly NOT Implemented

- M14-G — Incident Intelligence UI (not started)
- M14-H — Security Hardening (not started)
- M14-I — Final Verification (not started)
- Database persistence of `IncidentIntelligence` (no migration, no JSONB
  column — Option B from HANDOFF_M14B.md remains in effect)
- Automatic/background generation of any kind
- Notifications, SMS, email, ambulance dispatch, authority notification
- Incident status/priority/severity/type updates
- Authentication/authorization redesign

## Next module

M14-G — Incident Intelligence UI

---

Confirmation: M14-G was **not** started. No UI file
(`app/incidents/[id]/page.tsx` or any new component) was created or
modified in this session.
