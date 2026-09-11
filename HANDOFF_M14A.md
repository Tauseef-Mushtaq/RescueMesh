# HANDOFF_M14A.md

## Module

M14-A — Architecture Audit (inspection only, no implementation)

## Status

COMPLETE

---

## Existing Incident Architecture

**Table:** `incidents` (see `lib/supabase/types.ts::IncidentRow`)

Fields (snake_case in DB, camelCase in API responses via
`app/api/incidents/[id]/route.ts`):

| DB column | Type | Notes |
|---|---|---|
| `id` | uuid | validated with `UUID_PATTERN` in the `[id]` route |
| `report_text` | string | raw reporter text |
| `normalized_text` | string \| null | |
| `language` | string \| null | free string, not the `KnowledgeLanguage` union |
| `incident_type` | `IncidentType \| null` | 10-value union, see below |
| `summary` | string \| null | |
| `latitude` / `longitude` | number \| null | |
| `people_affected` / `children_count` / `elderly_count` | number \| null | |
| `medical_emergency` / `mobility_impairment` / `immediate_danger` / `food_shortage` / `water_risk` | boolean | critical indicator flags |
| `priority_score` | number \| null | **deterministic, authoritative** (M06) |
| `severity` | `IncidentSeverity \| null` | **deterministic, authoritative** (M06) |
| `confidence` | number \| null | |
| `status` | `IncidentStatus` | `"NEW" \| "VERIFIED" \| "RESOLVED"` |
| `created_at` / `updated_at` | string (ISO) | |

Related table: `incident_needs` (`id`, `incident_id`, `need_type` (free
string), `priority`, `created_at`).

```ts
export type IncidentType =
  | "flood" | "earthquake" | "fire" | "building_collapse"
  | "medical_emergency" | "missing_person" | "road_blockage"
  | "food_shortage" | "shelter_need" | "other";

export type IncidentSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type IncidentStatus = "NEW" | "VERIFIED" | "RESOLVED";
```

**Existing read path:** `GET /api/incidents/[id]` — server-side only, uses
`createServiceClient()`, validates the ID against `UUID_PATTERN`, returns
`{ success, data }` or `{ success: false, error }` with 400/404/500/503.
This is the exact request/response shape M14 should mirror for its own
route, and the exact server-side incident fetch M14 should reuse (either by
calling this route internally or, more likely, factoring the same Supabase
query — see "Recommended Integration Point").

**Existing UI:** `app/incidents/[id]/page.tsx` (client component). Fetches
via `GET /api/incidents/${id}`, has `loading | loaded | not_found | error`
states, and already renders: incident type/severity/status badges,
priority score, summary/report text, affected-people counts, critical
indicators, needs list, a **non-recalculating** "Priority Explanation"
card (explicitly documented as explanatory only — factors are derived
client-side from persisted fields, never a new score), and reported
location. This is the natural mount point for an "Incident Intelligence"
section — most likely as a new card in the right-hand column, or a new
full-width card below the existing grid.

---

## Existing RAG Architecture (M12)

- `lib/rag/retrieval.ts::retrieveRelevantChunks(query, options?)` — embeds
  the query (`embedTexts`, `RETRIEVAL_QUERY` task type), calls the
  `match_knowledge_chunks` Postgres RPC once. Options: `topK` (default 5,
  hard max 20), `category?: KnowledgeCategory`, `language?:
  KnowledgeLanguage`, `similarityThreshold?` (default **0.6**, empirically
  derived — documented in-file, do not change casually). Returns
  `{ ok: true, data: RetrievedChunk[] }` (empty array = no match, not an
  error) or `{ ok: false, reason, message }` with reasons
  `missing_api_key | provider_error | database_error`.
- `lib/rag/generation.ts::generateGroundedAnswer(query, chunks)` — calls
  Gemini via `@google/genai`, model chain
  `GEMINI_MODEL -> GEMINI_FALLBACK_MODEL -> GEMINI_SECONDARY_FALLBACK_MODEL`
  (defaults `gemini-3.8-flash` / `3.7` / `3.6`), 25s per-model timeout,
  retries on 429/503/timeout. **Returns unstructured freeform text**
  (`{ ok: true, answer: string }`), not structured JSON. There is no
  existing function that returns `{ assessment, actions, watchFor,
  informationGaps }` — M14-D will need a **new prompt + parsing function**
  that reuses the same `@google/genai` client, same model-chain constant
  pattern, and same timeout/retry helpers, but is not a "second Gemini
  client" in the sense AGENTS.md/the M14 plan prohibits (no new provider,
  no new SDK).
- `app/api/rag/route.ts` — the full existing request pattern M14's new
  route should mirror: rate-limit check first → parse/validate body →
  retrieve → if `chunks.length === 0` return `knowledgeFound: false`
  *without* calling Gemini → else generate → build deduplicated `sources`
  from the retrieved chunk rows (never from what Gemini said) → return
  `{ success, data: { answer, sources, knowledgeFound, retrievedChunks } }`.
- `lib/rag/client-response.ts` — the exact pattern for M14's client-side
  contract: a `RagSource` interface, an `isRagSuccessData` runtime type
  guard, and a `fallbackErrorForStatus(status)` helper. M14 should add an
  analogous `lib/incidents/intelligence-client.ts` (or similar) with an
  `IncidentIntelligenceSource` type and an
  `isIncidentIntelligenceSuccessData` guard, following this exact shape.

---

## Existing Knowledge Categories

```ts
export type KnowledgeCategory =
  | "flood" | "earthquake" | "fire" | "building_collapse"
  | "medical_emergency" | "missing_person" | "road_blockage"
  | "food_shortage" | "shelter_need" | "general";

export type KnowledgeLanguage = "English" | "Urdu" | "Roman Urdu";
```

**Category mapping is exact and trivial.** Every `IncidentType` value
except `"other"` is a verbatim, identically-spelled member of
`KnowledgeCategory` (`flood`, `earthquake`, `fire`, `building_collapse`,
`medical_emergency`, `missing_person`, `road_blockage`, `food_shortage`,
`shelter_need`). `KnowledgeCategory` additionally has `"general"`, which
has no `IncidentType` counterpart. So the mapping is:

- `incident.incident_type` is one of the 9 shared values → pass it
  directly as `category` to `retrieveRelevantChunks`.
- `incident.incident_type === "other"` or `null` → omit `category`
  entirely (general/unfiltered retrieval), per the plan's "no valid
  mapping exists → use general retrieval" rule. Do **not** map `"other"`
  to `"general"` — that would be inventing a mapping the schema doesn't
  actually assert.

---

## Existing Priority/Scoring (must remain untouched)

`lib/scoring/priority.ts` — pure, deterministic, Gemini-free
(`computePriority` or similar, takes `ExtractedIncident`, returns
`{ rawScore, maxRawScore, score, severity, factors }`). This is M06, has
its own test file (`priority.test.ts`, run via `npx tsx`, no test
framework installed), and per AGENTS.md is a **hard rule**: *"AI output
must never directly control critical application logic (e.g., priority
score, persistence decisions, authorization). AI proposes; deterministic
code decides."*

M14 must never let Gemini write to `priority_score`, `severity`, `status`,
or any other persisted incident field. M14's Gemini output is additive,
read-only, display-only context — never round-tripped back into the
`incidents` table. The existing incident detail page already models this
distinction correctly (it labels its priority breakdown "explanation...
not a recalculation"); M14's new section should carry the same framing
forward, per Part F's "Reported Incident Facts" vs "AI Decision Support"
requirement.

---

## Recommended M14 Integration Point

- **UI:** new card/section in `app/incidents/[id]/page.tsx`, placed after
  the existing cards (e.g. below "Reported Location" or spanning the full
  grid width beneath it). Reuses existing `Card`/`CardHeader`/
  `CardContent`/`CardTitle`/`Badge` primitives from `components/ui/`.
- **API:** `POST /api/incidents/[id]/intelligence` (App Router, matches
  the existing `app/api/incidents/[id]/route.ts` folder convention with a
  sibling `intelligence/route.ts`).
- **Server logic:** new `lib/incidents/intelligence.ts` (orchestration:
  fetch incident → build query → retrieve → generate → shape response),
  `lib/incidents/intelligence-prompt.ts` (system instruction + prompt
  builder, separate from `lib/rag/generation.ts`'s `/ask` prompt), and
  `lib/incidents/intelligence-client.ts` (client-side types + validation,
  mirroring `lib/rag/client-response.ts`).
- **Incident fetch:** the intelligence route needs the same authoritative
  fields already selected by `app/api/incidents/[id]/route.ts`'s
  `DETAIL_COLUMNS`. Simplest reuse without duplicating a second Supabase
  query builder: select a narrower column list directly
  (`incident_type, severity, priority_score, summary, report_text,
  people_affected, children_count, elderly_count, medical_emergency,
  mobility_impairment, immediate_danger, food_shortage, water_risk,
  latitude, longitude, status`) via `createServiceClient()`, the same
  pattern the existing route uses. This is not a "second incident model,"
  just a second (smaller) column selection against the same table/type —
  consistent with the plan's "reuse the existing incident model."

---

## Files That Should Be Reused

- `lib/rag/retrieval.ts` (`retrieveRelevantChunks`) — as-is, no changes.
- `lib/supabase/server.ts` (`createServiceClient`) — as-is.
- `lib/supabase/types.ts` — `IncidentRow`, `IncidentType`,
  `IncidentSeverity`, `IncidentStatus`, `KnowledgeCategory` — as-is, no
  new types added here (new M14-specific types go in
  `lib/incidents/intelligence-types.ts` instead).
- `lib/rate-limit.ts` (`checkRateLimit`, `getClientKey`) — as-is.
- `components/ui/*` (`Card`, `Badge`, `Button`, etc.) — as-is.
- `components/layout/page-shell.tsx` — as-is (page already uses it).
- The `@google/genai` client pattern, model-chain constant pattern, and
  `withTimeout`/`isRetryableProviderError` helpers from
  `lib/rag/generation.ts` — pattern reused, not imported wholesale, since
  M14's generation function needs a different prompt/output shape.

## Files That Should NOT Be Modified

- `lib/scoring/priority.ts` and its test — deterministic scoring is
  hard-ruled off-limits to AI influence.
- `app/api/incidents/[id]/route.ts` / `app/api/incidents/route.ts` —
  stable, working incident read/write paths; M14 adds a sibling route,
  does not touch these.
- `lib/rag/retrieval.ts`, `lib/rag/generation.ts`, `app/api/rag/route.ts`,
  `lib/rag/client-response.ts`, `app/ask/*` — M12/M13, explicitly stable
  per both prompts.
- `app/api/analyze/route.ts` / `lib/ai/incident-extraction.ts` — unrelated
  existing feature (report-time extraction, not incident intelligence);
  no naming or route collision with `/api/incidents/[id]/intelligence`.
- Map components (`components/map/`) — untouched per both prompts; the
  existing incident detail page doesn't currently embed a live map on
  this route anyway (it shows lat/lon as text), so M14 has nothing to
  integrate with here beyond what's already there.

---

## Risks

1. **Persistence conflict (real, unresolved — needs a decision before
   Part E/database discussion).** `AGENTS.md` states as an existing
   project rule: *"Persist AI output so page refreshes don't trigger
   repeated generation."* The M14 plan (both the original prompt and this
   multi-part plan) says *"Prefer NO database changes"* / *"Do not create
   an ai_analysis table... unless there is a genuinely necessary existing
   architecture reason."* These two documents pull in opposite
   directions. Resolving this is out of scope for Part A (inspection
   only) — flagging it now so it's a deliberate decision in Part E, not a
   silent default. The explicit-action "Analyze Incident" button (never
   auto-fires on page load) already satisfies the *spirit* of "no
   repeated generation on refresh" even with zero persistence, since a
   refresh simply returns to the un-analyzed initial state rather than
   re-calling Gemini automatically — this may be sufficient without a new
   table, but it should be called out explicitly in the final handoff
   rather than assumed.
2. **No test framework installed.** Both existing precedents
   (`lib/scoring/priority.test.ts`, `lib/rag/client-response.test.ts`) are
   self-running assertion scripts executed via `npx tsx <file>`, not a
   real runner (no vitest/jest in `package.json`). M14's Part B/C/D/E
   tests should follow this exact convention rather than introducing a
   test framework as a new dependency (which AGENTS.md and the M14 plan
   both prohibit as unnecessary).
3. **`generateGroundedAnswer` doesn't produce structured output.** M14-D
   must design a new prompt that gets Gemini to reliably separate
   assessment / actions / watchFor / informationGaps. Since there's no
   existing structured-output convention in this codebase's Gemini usage
   to follow, Part D will need to choose and document a concrete strategy
   (e.g., a JSON-mode/schema request vs. a delimited-section text format
   parsed with a runtime validator) rather than inventing one silently.
4. **`incident.language` is a free string**, not typed as
   `KnowledgeLanguage`. If M14 ever wants to pass `language` into
   `retrieveRelevantChunks`, it cannot pass `incident.language` directly —
   it would need validation against `VALID_LANGUAGES` first (see
   `app/api/rag/route.ts`'s pattern) or simply omit language filtering
   entirely for M14 (safer, simpler, and consistent with "small number of
   API calls" / no unnecessary complexity).
5. **Rate limiting is in-memory/per-process** (documented limitation of
   `lib/rate-limit.ts` itself). Fine to reuse as-is for the new endpoint's
   limiter per the plan's "do not add Redis" instruction, but the final
   handoff should carry forward the same "best-effort, not a hard
   guarantee" caveat already documented for `/api/rag`.

---

## Testing

No code was written in this part. No live Gemini/Supabase calls were
made. This audit is based entirely on static inspection of the repository
contents (`view`/`grep`/`wc`), matching the plan's "do not perform
unnecessary live Gemini calls" / "cheap static checks only" instruction
for Part A.

---

STOP — Part A complete. Awaiting direction before starting Part B
(Intelligence Contract).
