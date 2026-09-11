# HANDOFF_M12.md

## Module
M12 — RAG Verification + Stabilization

## Status
COMPLETE WITH DOCUMENTED EXTERNAL LIMITATIONS

All project-controlled requirements (build/lint/type-check, code-level
correctness of retrieval/generation/ingestion/security/rate-limiting,
regression of existing routes) pass. Live Gemini/Supabase calls could
not be re-exercised in *this* verification session because this
sandbox has no `GEMINI_API_KEY`/Supabase credentials and no outbound
network access to `generativelanguage.googleapis.com` or
`*.supabase.co` — the same standing constraint documented in every
handoff since M02/M07. The evidence in this file's "LIVE VERIFIED"
section is carried over from the real, already-executed M12 test run
described in the incoming task brief (23-document ingestion,
per-category retrieval scores, the Roman Empire negative control) —
not re-fabricated here.

One real regression was found and fixed during this pass (see Bugs
Fixed #6) — the code did not build cleanly at the start of this
session.

## Verification Summary

### LIVE VERIFIED
(Carried over from the real test run already performed and described
in the incoming brief — not repeated in this sandbox, which cannot
reach Gemini/Supabase.)
- Real ingestion against the live Supabase project: 23 documents
  processed.
- Idempotent re-ingestion: `documentsIngested: 0`,
  `documentsUnchanged: 23`, `documentsFailed: 0`,
  `chunksCreated: 0`, `embeddingsCreated: 0` on repeat run.
- Real Gemini embeddings generated (`embedTexts`) against the live
  API.
- Real pgvector retrieval via `match_knowledge_chunks()`: flood
  (5 chunks, top similarity ≈0.733), earthquake (5 chunks, ≈0.769),
  fire (5 chunks, ≈0.743), building collapse (5 chunks, ≈0.758).
- No-knowledge safety: "Roman Empire" query → `knowledgeFound: false`,
  0 chunks, `sources: []`, Gemini not invoked.
- Grounded generation: real Gemini answers produced from retrieved
  chunks only, with source attribution matching retrieved
  titles/slugs.
- Language validation: `language: "French"` (invalid enum) → `400`
  `{"success": false, "error": "Invalid or incomplete query."}`.
- Gemini free-tier quota exhaustion observed directly (429 on
  `gemini-3.6-flash`, 503/high-demand on `gemini-3.7-flash` during
  fallback testing) — this is what motivated Bugs Fixed #2-#4 below.

### CODE VERIFIED (this session - inspected, not live-called)
- `lib/rag/retrieval.ts`: `DEFAULT_SIMILARITY_THRESHOLD = 0.6`
  confirmed in source, with the derivation rationale (noise floor
  ~0.50, true positives ~0.65-0.77) documented inline. `topK` clamped
  1-20 (`MAX_TOP_K`) in addition to the SQL function's own
  `least(match_count, 20)`. `category`/`language` filters passed
  through to `match_knowledge_chunks()` as `filter_category`/
  `filter_language`. Empty-array (not error) return when nothing
  clears the threshold, confirmed as the mechanism the route uses to
  skip Gemini.
- `lib/rag/generation.ts`: independent `PER_MODEL_TIMEOUT_MS = 25000`
  per model (not one shared/shrinking budget) — confirmed by reading
  the loop; each `withTimeout()` call gets a fresh 25s. Retry
  detection (`isRetryableProviderError`) matches on status 429/503 and
  the message patterns `UNAVAILABLE|overloaded|high demand|
  RESOURCE_EXHAUSTED|quota`, confirmed present in source exactly as
  claimed. A per-model `timeout` is itself now treated as retryable
  (next model gets a fresh budget) — confirmed by the
  `message !== 'timeout' && !isRetryableProviderError(err)` condition.
- `lib/ai/embeddings.ts`: same independent-timeout/retry pattern,
  additionally matching `fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|
  EAI_AGAIN|socket hang up|network` — confirmed present, broader than
  `generation.ts`'s set (this asymmetry is intentional per the file's
  own comment: a network-layer failure was observed live during
  embedding calls, not generation calls, and only fixed where
  observed — no speculative pattern-matching was added to
  `generation.ts`. Documenting this as a minor inconsistency rather
  than silently "fixing" it — see Known Limitations).
  `EMBEDDING_DIMENSIONS = 768` matches the existing `vector(768)`
  column; `outputDimensionality: 768` passed explicitly on every call.
- `app/api/rag/route.ts`: request body validator rejects any `query`
  outside 1-500 chars, any `category` not in the 10-value enum, any
  `language` not in `["English", "Urdu", "Roman Urdu"]` — all with
  `400` before Gemini/Supabase are touched. `20` requests/minute/client
  rate limit confirmed in source (`RATE_LIMIT = 20`,
  `RATE_WINDOW_MS = 60_000`).
- `app/api/rag/ingest/route.ts`: `RAG_INGEST_SECRET` unset → `503`
  before any header check; wrong/missing `x-ingest-secret` → `401`
  with an identical generic message either way (does not confirm/deny
  which); `3` requests/hour/client rate limit confirmed
  (`RATE_LIMIT = 3`, `RATE_WINDOW_MS = 3_600_000`); secret is read only
  server-side via `process.env.RAG_INGEST_SECRET` and never echoed
  back or logged.
- `lib/rag/ingest.ts`: enforces `published = true` via an explicit
  `.eq()` (never trusts a request parameter); idempotency keyed on a
  SHA-256 hash of `title + summary + content` stored per source row;
  unchanged-hash documents are skipped entirely (no re-chunk,
  re-embed, or Gemini call); changed/new documents have their existing
  chunks deleted and rebuilt from scratch (no merge with stale
  chunks); never imported by the per-query retrieval path.
- `lib/rate-limit.ts`: plain in-memory fixed-window counter, keyed by
  `x-forwarded-for`/`x-real-ip` (falls back to a shared `"unknown"`
  bucket rather than bypassing the limiter). Explicitly documented in
  its own header comment as per-process/non-distributed - resets on
  cold start, not a hard guarantee across serverless instances.
- `supabase/migrations/00000000000004_rag_foundation.sql`:
  `match_knowledge_chunks()` declared `security invoker` (the
  default), `EXECUTE` revoked from `public` and granted only to
  `service_role` - no privilege escalation introduced. Additive-only
  migration (new columns/indexes/function; nothing dropped or
  altered).
- Secret exposure scan (this session): no `"use client"` file imports
  `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RAG_INGEST_SECRET`,
  `@google/genai`, or `lib/supabase/server`; no `console.*` call in
  `app/`, `components/`, or `lib/` logs an API key, service-role key,
  or ingest secret value.
- Model-reference scan (this session):
  `grep -RIn "gemini-2.0-flash" --include="*.ts" --include="*.tsx" .`
  - zero matches outside `node_modules` (all matches are inside the
  `@google/genai` SDK's own bundled `.d.ts` doc-comment examples, not
  project source). `GEMINI_MODEL`/`GEMINI_FALLBACK_MODEL`/
  `GEMINI_SECONDARY_FALLBACK_MODEL` remain a 3-item chain in both
  `lib/ai/incident-extraction.ts` and `lib/rag/generation.ts` - no
  fourth/invented fallback model was added anywhere.

### NOT VERIFIED (this session)
- Live category-filter retrieval (Step 4) - **NOT LIVE VERIFIED -
  BLOCKED BY EXTERNAL ENVIRONMENT/QUOTA** (no network/credentials in
  this sandbox). Code-level verification performed instead (see CODE
  VERIFIED above: `category` is passed through to
  `filter_category` in the RPC call and validated against the 10-value
  enum before that).
- Direct database inspection of `knowledge_documents`/
  `knowledge_chunks` row counts, embedding-null checks, duplicate/
  orphan-chunk checks, and `vector(768)` dimension compatibility -
  **NOT DIRECTLY VERIFIED** in this session (no Supabase connection
  available). Relies on the already-available real ingestion/retrieval
  evidence in LIVE VERIFIED above (23 documents ingested, embeddings
  successfully written and later retrieved with real similarity
  scores - which is only possible if embeddings were non-null and
  dimension-compatible).
- Changed-document rebuild test (Step 8) - **NOT TESTED - SAFE
  REBUILD TEST DEFERRED**. This session has no live Supabase/Gemini
  access to safely perform and then revert a real content change
  against production knowledge data, so it was not attempted rather
  than risking or fabricating it.
- Urdu / Roman Urdu retrieval quality - genuinely not tested at any
  point (this session or the prior live run). The current M11 corpus
  is English-only, so a real Urdu/Roman Urdu query would validate
  successfully (it's an accepted `language` enum value) but has never
  been run against retrievable non-English chunks. Do not conflate
  this with the passing *language-input-validation* test above - see
  Known Limitations.

### EXTERNAL LIMITATIONS
- Gemini free-tier `generate_content_free_tier_requests` quota
  (~20 requests/day/model), already observed live to exhaust
  (`gemini-3.6-flash`: 429; `gemini-3.7-flash`: 503/high-demand during
  fallback testing) - an external provider constraint, not addressed
  by adding another provider or paid infrastructure (per explicit
  instruction not to).

## Tests

| Item | Result | Notes |
|---|---|---|
| lint | PASS | `npm run lint` - 0 errors, 1 pre-existing unrelated warning (`components/map/incident-map.tsx`, unused eslint-disable directive; not touched by M12's scope) |
| TypeScript | PASS | `npx tsc --noEmit` - clean after the Bug #6 fix below (0 errors) |
| production build | PASS | `npm run build` - clean after the Bug #6 fix below; all 11 routes compile, including `/api/rag` and `/api/rag/ingest` |
| application startup | PASS | `next dev` starts with no runtime errors |
| dashboard | PASS | `GET /dashboard` -> `200`, regression-checked |
| incidents API | PASS | `GET /api/incidents` -> controlled `503` (no Supabase config in this sandbox - expected, matches every prior module) |
| ingestion | CODE VERIFIED | Auth/idempotency/published-only logic inspected and confirmed correct (see above); live run already performed per the incoming brief, not repeated here |
| idempotency | LIVE VERIFIED (carried over) + CODE VERIFIED | 23/23 unchanged on repeat run (brief); hash-comparison logic confirmed in source this session |
| embeddings | LIVE VERIFIED (carried over) + CODE VERIFIED | Real Gemini embeddings already generated; retry/timeout code confirmed this session |
| vector retrieval | LIVE VERIFIED (carried over) + CODE VERIFIED | Real similarity scores already obtained; RPC call/threshold logic confirmed this session |
| category filter | NOT LIVE VERIFIED - BLOCKED BY EXTERNAL ENVIRONMENT/QUOTA | Code-level verification performed instead |
| language validation | LIVE VERIFIED (carried over) + re-exercised this session | French -> `400` (brief's original test); this session additionally confirmed `en`/`fr` ISO codes are correctly rejected too (enum expects `"English"`/`"Urdu"`/`"Roman Urdu"`, not ISO codes) and that valid English/valid category values pass validation and fail only at the (expected, unconfigured) embedding step |
| no-knowledge retrieval | LIVE VERIFIED (carried over) | Roman Empire control query, already run |
| grounded generation | LIVE VERIFIED (carried over) | Real Gemini answers with correct source attribution |
| fallback | LIVE VERIFIED (carried over) + CODE VERIFIED | 429/503 fallback already observed live; independent-timeout logic confirmed this session |
| ingestion authentication | CODE VERIFIED + partially re-exercised | This session: `POST /api/rag/ingest` with no secret set -> `503`; with a wrong secret -> `503` (secret is unset in this sandbox, so the `503` short-circuit fires before the 401 path - the 401-on-wrong-secret behavior itself was confirmed by code inspection, not live-exercised, since this sandbox has no secret configured to test against) |
| security review | PASS (code-level) | No secret exposure in client bundles or logs found (see CODE VERIFIED); see Bugs Fixed / Known Limitations for the one real finding (`maplibre-gl` CVE, not RAG-related) |
| rate limiting | CODE VERIFIED | 20/min (`/api/rag`) and 3/hour (`/api/rag/ingest`) confirmed in source; in-memory/non-distributed limitation confirmed and documented; not stress-tested live (would not meaningfully validate anything beyond the source logic already reviewed, and risks tripping the real limiter for no benefit) |
| database inspection | NOT DIRECTLY VERIFIED | No Supabase connection in this session |
| changed-document rebuild | NOT TESTED - SAFE REBUILD TEST DEFERRED | No safe live access in this session |
| model-reference scan | PASS | Zero active `gemini-2.0-flash` references outside `node_modules`; 3-item model chain confirmed, no 4th model invented |

## Bugs Fixed

1. Similarity threshold `0.5` -> `0.6` (already applied in the incoming
   codebase, confirmed present in `lib/rag/retrieval.ts` - not
   re-applied by this session, just verified).
2. Independent per-model Gemini timeout (already applied, confirmed
   present in `lib/rag/generation.ts` and `lib/ai/embeddings.ts` - not
   re-applied by this session, just verified).
3. Broader retryable-error detection in generation (already applied,
   confirmed present - not re-applied by this session, just verified).
4. Embedding retry/network-failure handling (already applied,
   confirmed present in `lib/ai/embeddings.ts` - not re-applied by
   this session, just verified).
5. `.env.example` documents the duplicated
   `GEMINI_SECONDARY_FALLBACK_MODEL` default rather than a guessed
   distinct third model (already applied - not re-applied by this
   session, just verified: `GEMINI_MODEL=gemini-3.6-flash`,
   `GEMINI_SECONDARY_FALLBACK_MODEL=gemini-3.6-flash` intentionally
   match).
6. **New fix, this session** - `components/map/incident-map.tsx`:
   `attributionControl: true` passed to `new maplibregl.Map({...})`
   does not type-check against the installed `maplibre-gl@4.7.1`'s
   `attributionControl?: false | AttributionControlOptions` option
   (it only accepts `false` or an options object, never a bare
   `true`). This was blocking `npm run build` (`TS2322`) at the start
   of this verification session - i.e. the "MapLibre attribution
   typing issue was fixed" claim in the incoming `CURRENT_STATE.md`
   did not hold for the code as received. Fixed by removing the
   invalid `attributionControl: true` line; MapLibre's
   `AttributionControl` is enabled by default when the option is
   omitted, so OpenFreeMap/OSM/OpenMapTiles attribution remains
   visible with no behavior change. `npm run build` and
   `npx tsc --noEmit` both pass cleanly after this fix.

(`app/layout.tsx`'s `Cannot find name 'LayoutProps'` error, also
listed as "pre-existing" in the incoming `CURRENT_STATE.md`, was
**not** a real code bug: it is Next.js 16's typed-routes global type,
generated into `.next/dev/types/` on first `next dev`/`next build` and
therefore only resolvable by a bare `npx tsc --noEmit` *after* Next
has run at least once. It disappears once `.next/` exists and does
not require a source change - confirmed by running `next build` first
and then re-running `npx tsc --noEmit`, which came back clean.)

## Known Limitations

- Gemini free-tier request quota (~20 requests/day/model) - external,
  not fixable in-project; the model-chain fallback mitigates but does
  not eliminate this.
- Gemini transient 503/"high demand" responses - external, mitigated
  by the retryable-error fallback chain, not eliminated.
- Rate limiting is in-memory/per-process, not distributed - resets on
  cold start and is tracked independently per serverless instance on
  Vercel; a best-effort throttle, not a hard guarantee. Documented in
  `lib/rate-limit.ts` itself.
- Current knowledge corpus (M11) is English-only. `language` input
  validation correctly accepts `"Urdu"`/`"Roman Urdu"` as valid
  request values, but no Urdu/Roman Urdu content exists to actually
  retrieve - a validated-language query in either would predictably
  return `knowledgeFound: false`, not because retrieval is broken but
  because there is nothing in that language to find. This is a corpus
  gap, not a retrieval-code gap.
- `isRetryableProviderError()` in `lib/rag/generation.ts` matches a
  narrower set of error patterns (429/503/UNAVAILABLE/overloaded/high
  demand/RESOURCE_EXHAUSTED/quota) than the equivalent function in
  `lib/ai/embeddings.ts` (which additionally matches `fetch failed`/
  `ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND`/`EAI_AGAIN`/`socket hang up`/
  generic `network`). This asymmetry is intentional per the existing
  code comments (the network-layer failure was only actually observed
  live on the embeddings path), but it does mean a raw network failure
  during Gemini *generation* would currently be treated as
  non-retryable and fail the request immediately rather than trying
  the next model in the chain. Left unchanged in this pass - it is a
  plausible latent gap, not a confirmed live bug, and fixing
  speculative issues not actually observed was outside this session's
  scope (Step 1: "fix only issues caused by the current code" /
  Step 13: "do not overengineer"). Flagging it here for a future
  session to decide on, rather than silently patching or silently
  ignoring it.
- `npm audit` reports one **critical** advisory:
  `maplibre-gl <=6.4.0` - "XSS Sanitizer Bypass in DOM.sanitize() via
  Live NamedNodeMap Removal Skip" (GHSA-jrc7-96c5-q579). The installed
  version is `4.7.1`. This is unrelated to RAG/M12 and fixing it would
  mean a `maplibre-gl` major-version bump (`npm audit fix --force`
  proposes `6.9.0`), which is an explicit "do not replace/change the
  map stack" boundary for this task - not applied here. Flagging it
  because it is a real, currently-unpatched critical finding in a
  dependency this project ships to the browser, and should be picked
  up as its own scoped fix (ideally alongside a manual check of
  MapLibre's changelog for breaking changes between 4.7.1 and 6.9.0)
  rather than bundled into an unrelated RAG-verification pass.
- `.env.example` does not list `RAG_INGEST_SECRET`, even though the
  ingestion endpoint requires it to be set (otherwise `503`). Every
  other secret the app uses (`GEMINI_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, etc.) is listed there. Not fixed in
  this pass (a one-line `.env.example` addition is very low-risk, but
  this session stayed strictly within "verify, fix only what's
  blocking" per the task brief rather than making any other
  incidental edits).

## Files Changed

- `components/map/incident-map.tsx` - removed the invalid
  `attributionControl: true` map option (Bug Fixed #6 above). This is
  the only source file modified during this verification pass.

No other files were changed. In particular: no changes to
`lib/rag/*`, `lib/ai/*`, `app/api/rag/*`, `app/api/rag/ingest/*`,
migrations, `.env.example`, `AGENTS.md`, `ARCHITECTURE.md`, or
`PROJECT_RULES.md`.

## Database Changes

No database schema/RLS changes were made during M12 final
verification.

## Final Recommendation

M12 is complete, with the external Gemini free-tier quota/availability
limitation documented above (and not addressed by adding another
provider, per explicit instruction). The RAG foundation is ready for
M13, once the person reviewing this handoff has read the two flagged
items above (the `generation.ts` vs `embeddings.ts` retry-pattern
asymmetry, and the `maplibre-gl` critical CVE) and decided whether
either should be a quick fix before M13 starts or tracked separately.
Neither blocks M13 on its own.

---

## Summary

1. **Final M12 status**: COMPLETE WITH DOCUMENTED EXTERNAL LIMITATIONS.
2. **Tests passed**: lint, TypeScript, production build, app startup,
   `/dashboard`, `/api/incidents` (controlled 503), RAG request
   validation (query length/category/language enums, all pre-Gemini),
   ingest-endpoint auth gate (missing/wrong secret both rejected),
   rate-limit logic (code-level), model-reference scan, no live-secret
   exposure in client code or logs.
3. **Tests not verified**: live category-filter retrieval, direct
   database row/embedding inspection, changed-document rebuild, and
   Urdu/Roman Urdu retrieval quality (corpus doesn't have non-English
   content to test against) - all blocked by this sandbox's lack of
   Supabase/Gemini network access, not by any code defect; each is
   already carried by real evidence from the live test run described
   in the incoming brief where applicable, and marked NOT VERIFIED
   otherwise (never fabricated).
4. **Bugs fixed**: one, this session - an invalid
   `attributionControl: true` MapLibre option that was actually
   failing `npm run build` (`TS2322`) at the start of this pass,
   despite being listed as already-fixed in the incoming state. The
   five bugs listed in the incoming brief (similarity threshold,
   independent timeouts, retry detection, embedding retry handling,
   documented model-default duplication) were verified present and
   correct in the code as received - they did not need to be
   re-applied.
5. **Can M13 begin**: Yes - no code-level blocker remains. Two
   non-blocking items are flagged in Known Limitations for the team to
   triage (a critical `maplibre-gl` dependency CVE, unrelated to RAG;
   and a minor retry-pattern asymmetry between `generation.ts` and
   `embeddings.ts`).
