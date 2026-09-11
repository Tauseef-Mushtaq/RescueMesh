# HANDOFF_M14B.md

## Module

M14-B — Intelligence Contract + Persistence Decision

## Status

COMPLETE (types/mapping/validation), with the persistence question
resolved as **Option B** (documented below, no schema change made).

## Note on source document

The M14-B instruction document provided to this session was truncated
mid-sentence at "PERSISTENCE SAFETY RULE / If intelligenc..." — the rule
itself was never received. Parts 1–5 (types, category mapping, language
decision, runtime validation, and the persistence investigation/decision)
were all fully specified and are complete. Nothing below fills in the
missing rule by guessing; if there was an additional requirement in that
cut-off text, it should be re-supplied and folded in before M14-C treats
this contract as final.

---

## Types Created

`lib/incidents/intelligence-types.ts`:

```ts
export interface IncidentIntelligenceSource {
  title: string | null;
  slug: string | null;
  category: KnowledgeCategory | null;
}

export interface IncidentIntelligence {
  incidentId: string;
  knowledgeFound: boolean;
  assessment: string;
  actions: string[];
  watchFor: string[];
  informationGaps: string[];
  sources: IncidentIntelligenceSource[];
}
```

Matches the plan's conceptual structure exactly; no fields added or
removed. `KnowledgeCategory` is imported from the existing
`lib/supabase/types.ts` rather than redeclared.

### No-knowledge contract

Chose a **flat object with a `knowledgeFound` boolean flag** (matching
`RagSuccessData` in `lib/rag/client-response.ts`) over a discriminated
union (`{ status: "found"; ... } | { status: "not_found" }`). Reasons:

- Mirrors the existing, working M13 contract exactly — no new pattern for
  the codebase to carry.
- When `knowledgeFound` is `false`: `assessment` is set to a short
  controlled string (e.g. "No verified RescueMesh knowledge was found for
  this incident." — exact copy TBD in M14-D/E, not invented here),
  `actions`/`watchFor`/`informationGaps`/`sources` are all `[]`. No
  placeholder text is ever forced into an array, per the plan's explicit
  instruction.
- The client validator (below) accepts this shape as valid, not as a
  degraded/partial case — it's a first-class, fully-specified state.

---

## Category Mapping

`lib/incidents/intelligence-category.ts` —
`mapIncidentTypeToKnowledgeCategory(incidentType: IncidentType | null):
KnowledgeCategory | null`.

Pure, deterministic, no I/O. Implemented as an exhaustive `switch` (with a
`never`-typed default) rather than a plain lookup object specifically so
that if a new `IncidentType` value is ever added to
`lib/supabase/types.ts` without a corresponding case here, `tsc` fails
the build instead of the mapping silently returning `undefined`/an
invalid category at runtime.

`"other"` and `null` both return `null` (→ caller omits the `category`
option → unfiltered retrieval), per the plan's explicit instruction not
to invent an `other → general` mapping.

Tests: `lib/incidents/intelligence-category.test.ts` (self-running
assertion script, `npx tsx` convention — see Testing section).

---

## Language Decision

**Decision: M14 does not filter retrieval by language.**

`incident.language` is a free string (not the `KnowledgeLanguage` union
`retrieveRelevantChunks` expects), and the M11 knowledge corpus is
English-only per HANDOFF_M14A.md. Validating an arbitrary incident
language string against `VALID_LANGUAGES` and passing it through would
add a validation path with no real benefit given a single-language
corpus, and risks silently narrowing retrieval to zero results for a
non-English incident report even though the (English-only) knowledge base
might still have relevant guidance. `retrieveRelevantChunks` is simply
called without a `language` option in M14-C/D. No new language system was
created. This is a deliberate scope decision, not an oversight — if a
non-English corpus is added in a future module, this decision should be
revisited then, not preemptively engineered around now.

---

## Runtime Response Validation

`lib/incidents/intelligence-client.ts`, following
`lib/rag/client-response.ts`'s exact philosophy:

- `isIncidentIntelligenceSource(value): value is IncidentIntelligenceSource`
  — validates `title`/`slug` are `string | null`, and `category` is
  either `null` or one of the 10 real `KnowledgeCategory` values (an
  explicit whitelist, not just `typeof === "string"`, so a malformed or
  hallucinated category string is caught here rather than reaching the
  UI).
- `isIncidentIntelligenceData(value): value is IncidentIntelligence` —
  validates `incidentId` (non-empty string), `knowledgeFound` (boolean),
  `assessment` (string), `actions`/`watchFor`/`informationGaps` (each a
  string array — every entry checked, not just array-ness), and `sources`
  (array, every entry validated via `isIncidentIntelligenceSource`). A
  single malformed source invalidates the whole payload, matching the
  plan's "malformed responses must be treated as errors" instruction
  (no partial rendering).
- `fallbackErrorForStatus(status): string` — same purpose and shape as
  the M13 version, extended with a `404` case (an incident-lookup
  endpoint has a "not found" state `/api/rag` never had). Statuses
  covered: 400, 404, 429, 503, and a generic fallback for anything else
  (mirrors `/api/rag`'s existing 400/429/502/503 set plus the new 404).

Nothing here overvalidates the intentionally-nullable fields
(`title`/`slug`/`category` on a source may legitimately be `null`; a
`null` source is still rejected as malformed, since a source can only
exist by having at least come from a real retrieved chunk).

Tests: `lib/incidents/intelligence-client.test.ts` (same `npx tsx`
convention).

---

## Persistence Decision

### Investigation

- `AGENTS.md` line 52: *"Persist AI output so page refreshes don't
  trigger repeated generation."* This is a general project rule, not
  M14-specific — it predates M14 and was written against the M12/M13 RAG
  feature context.
- Checked all four existing migrations
  (`supabase/migrations/0000000000000{1,2,3,4}_*.sql`) for any
  already-existing "store AI output" pattern. Found exactly one
  candidate: **`incident_evidence`** (defined in migration 1, alongside
  the original `incidents` schema):

  ```sql
  create table if not exists incident_evidence (
    id            uuid primary key default gen_random_uuid(),
    incident_id   uuid not null references incidents (id) on delete cascade,
    claim         text not null,
    source_id     uuid references knowledge_sources (id) on delete set null,
    confidence    numeric(3, 2) check (confidence is null or (confidence between 0 and 1)),
    created_at    timestamptz not null default now()
  );
  ```

  It has RLS enabled with an `authenticated_read_incident_evidence` SELECT
  policy, and (per the migration's own comment) no insert/update/delete
  policy — all writes go through the service-role client, which is
  exactly how M14's server-side route would write anyway.

- Checked whether this table is used anywhere in application code today:
  `grep -rn "incident_evidence\|IncidentEvidenceRow"` across the whole
  repo (excluding `node_modules`) returns **only** the migration itself
  and the corresponding `IncidentEvidenceRow` type in
  `lib/supabase/types.ts`. It is defined but currently unused — no API
  route, no query, nothing reads or writes it today.

### Why `incident_evidence` cannot cleanly satisfy M14 as-is

- **Shape mismatch.** `incident_evidence` stores one atomic `claim` (a
  single short text) per row with one optional `source_id`. M14's
  `IncidentIntelligence` is a structured object per incident
  (`assessment` + 3 string arrays + up to several sources). Storing one
  M14 result would mean decomposing it into many separate
  `incident_evidence` rows (one per action, one per watch-for item...),
  which loses the grouping ("this batch of claims came from the same
  analysis run") and has no natural place for `knowledgeFound` or
  `informationGaps` at all — `informationGaps` are explicitly the
  *absence* of a claim, not a claim with a source, so they don't fit this
  table's model even conceptually.
- **No idempotency/versioning key.** There's no `analysis_id` or
  `generated_at` grouping column, and no unique constraint preventing
  duplicate inserts. Re-running "Analyze Incident" (Part F explicitly
  allows re-analysis) would just keep appending more rows per incident
  with no way to know which rows belong to the latest run versus a stale
  one, without adding new columns — which is itself a schema change.
- **No precedent code to extend.** Unlike `lib/rag/retrieval.ts` or
  `lib/scoring/priority.ts`, there is no existing query/insert code
  against this table to reuse or follow the pattern of. Using it for M14
  would mean designing that pattern from scratch anyway, with none of the
  benefit of "reusing an existing mechanism" the plan calls for — it
  would be new code either way, just against an old table whose shape
  happens to be wrong for the job.

### Decision: **Option B**

Persistence is **not currently feasible without a schema change**, and
this part does not create one, per the plan's explicit instruction ("Do
NOT create a migration in M14-B").

- The `AGENTS.md` requirement is real and not being ignored — see the
  mitigation below.
- `incident_evidence` exists but cannot safely/cleanly hold M14 output
  for the structural reasons above.
- **Smallest future schema change that would satisfy it, if pursued:** a
  new nullable JSON/JSONB column on `incidents` itself (e.g.
  `intelligence jsonb`, `intelligence_generated_at timestamptz`) storing
  the last `IncidentIntelligence` result verbatim, overwritten on each
  "Analyze Incident"/"Analyze Again" click. This is deliberately *not* a
  new table: one incident has at most one "current" intelligence result
  (Part F's re-analysis story is "replace," not "accumulate a history"),
  so a JSONB column on the existing row is the smallest correct shape —
  smaller than a new table with its own RLS policy, foreign key, and
  index. This is a recommendation for M14-E to decide on deliberately,
  not something implemented here.
- **Interim mitigation (already true without any schema change):** the
  M14 UI's "Analyze Incident" is an explicit user action that never
  auto-fires on page load or on refresh (Part F, and Phase 22 of the
  original M14 prompt, both require this). A page refresh therefore
  returns to the un-analyzed initial state and does **not** call Gemini
  again by itself — the specific failure mode AGENTS.md's rule is
  guarding against ("refresh triggers repeated generation") cannot happen
  even with zero persistence. What persistence would additionally buy is
  *surviving a refresh with the previous result still visible* (avoiding
  a judge having to re-click "Analyze Incident" after an accidental
  reload) — a real but smaller gap than "repeated generation," and one
  this handoff flags explicitly for M14-E rather than deciding
  unilaterally to add a column for.

**Flagged for M14-E:** confirm with the project owner whether the
interim mitigation is sufficient for the hackathon submission, or whether
the `intelligence`/`intelligence_generated_at` JSONB-on-`incidents`
column should be added before M14 is considered complete. Either answer
is implementable in E without revisiting this contract.

---

## Files Changed

- `lib/incidents/intelligence-types.ts` (new)
- `lib/incidents/intelligence-category.ts` (new)
- `lib/incidents/intelligence-category.test.ts` (new)
- `lib/incidents/intelligence-client.ts` (new)
- `lib/incidents/intelligence-client.test.ts` (new)
- `HANDOFF_M14B.md` (new, this file)

No existing files modified. No database migrations added.

---

## Testing

| Test | Verification Type | Notes |
|---|---|---|
| `intelligence-category.test.ts` — 11 assertions (9 direct mappings + 2 no-mapping cases) | CODE VERIFIED | Written and manually reviewed against `mapIncidentTypeToKnowledgeCategory`'s implementation; not executed. |
| `intelligence-client.test.ts` — 24 assertions across source/data/status-mapping validation | CODE VERIFIED | Same — written and manually reviewed; not executed. |
| `npx tsc --noEmit` | BLOCKED | `node_modules` is not installed in this sandbox and `npm install` failed with a `403 Forbidden` from the npm registry (network egress is disabled in this environment per its configuration) — see raw output below. |
| `npx tsx lib/incidents/*.test.ts` | BLOCKED | Same cause as above; `tsx` is not installed and cannot be installed here. |

```
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/zod-validation-error/-/zod-validation-error-4.0.2.tgz
```

Both new test files were written to closely match the exact style,
assertion helper, and coverage philosophy of the two existing precedent
files (`lib/scoring/priority.test.ts`, `lib/rag/client-response.test.ts`)
and were re-read end-to-end against the implementation files for type and
logic correctness, but **this is CODE VERIFIED, not LIVE VERIFIED or even
locally-executed NOT VERIFIED** — they have not actually been run in this
session. Run `npm install && npx tsx lib/incidents/intelligence-category.test.ts
&& npx tsx lib/incidents/intelligence-client.test.ts` in an environment
with registry access before trusting them as passing.

No live Gemini or Supabase calls were made or needed for this part.

---

STOP — Part B complete. Outstanding items before Part C:

1. Confirm the missing "PERSISTENCE SAFETY RULE" text (the M14-B
   instructions were truncated) in case it changes anything here.
2. Confirm the persistence Option B decision (interim mitigation vs.
   adding the `intelligence`/`intelligence_generated_at` JSONB columns)
   before M14-E's API route is built against a final answer.
3. Run the two new test files in an environment with npm registry access
   to convert their status from CODE VERIFIED to LIVE VERIFIED / actually
   executed.

Awaiting direction before starting Part C (Retrieval Integration).
