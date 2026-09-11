# HANDOFF_M14C.md

## Module

M14-C — Incident Context Builder + Retrieval Integration

## Status

COMPLETE WITH DOCUMENTED EXTERNAL LIMITATIONS (implementation complete;
test execution blocked by sandbox network restrictions — see Tests below).

---

## Implemented

- `lib/incidents/intelligence-context.ts` (new)
  - `IncidentContextInput` — `Pick<IncidentRow, ...>` covering exactly the
    8 fields the query builder uses.
  - `IncidentContext` — `{ query: string; category: KnowledgeCategory |
    null }`.
  - `buildIncidentContext(incident): IncidentContext` — pure, deterministic.
  - `IncidentKnowledgeResult` — `{ context: IncidentContext; retrieval:
    RetrievalResult }`, where `RetrievalResult` is re-used unchanged from
    `lib/rag/retrieval.ts`.
  - `retrieveIncidentKnowledge(incident, retrieveFn?): Promise<
    IncidentKnowledgeResult>` — calls the existing
    `retrieveRelevantChunks` (injectable for offline testing, defaults to
    the real function).
- `lib/incidents/intelligence-context.test.ts` (new) — 9 test groups,
  self-running assertion script, `npx tsx` convention.
- `HANDOFF_M14C.md` (new, this file).

No existing file was modified. No database migration was created.

---

## Context-building behavior

**Fields used** (all `Pick`ed from `IncidentRow`, none redeclared):
`incident_type`, `summary`, `report_text`, `medical_emergency`,
`mobility_impairment`, `immediate_danger`, `food_shortage`,
`water_risk`. Deliberately excludes `id`, `latitude`/`longitude`,
`created_at`/`updated_at`, `status`, `priority_score`,
`people_affected`/`children_count`/`elderly_count`, per the module
prompt's "represent the situation, not the database row" instruction and
its explicit list of fields to never include (UUID, lat/lon, timestamps,
status, priority score). `children_count`/`elderly_count` were also left
out of the query itself — they're counts, not the boolean "critical
indicator" fields the prompt's Test 4 scope is about — though they remain
available on the full `IncidentRow` for later modules to use elsewhere if
needed; they were simply never part of this contract.

**Text bounding:** `summary` is preferred when present and non-empty
after whitespace normalization; `report_text` is used only as a fallback
when `summary` is null/empty. Either way the chosen text is passed
through `boundedExcerpt()`, which normalizes whitespace (collapses
newlines/repeated spaces to single spaces, trims) and hard-truncates to
160 characters by character count — no sentence-boundary detection or
summarization, matching the "do not over-engineer semantics" instruction.
The fully composed query (type term + indicators + excerpt + closing
phrase) is separately re-bounded to 300 characters as a final safety net,
independent of the 160-character excerpt bound, since the pieces added
together could otherwise still exceed a reasonable query length.

**Structured indicators:** the five boolean fields
(`immediate_danger`, `medical_emergency`, `mobility_impairment`,
`food_shortage`, `water_risk`) each contribute a fixed natural-language
phrase to the query only when `true`, in a fixed deterministic order.
Untriggered indicators contribute nothing (no "no medical emergency"
noise in the query).

**Category mapping:** delegates entirely to the M14-B
`mapIncidentTypeToKnowledgeCategory` helper — not reimplemented or
duplicated here. `incident_type: "other"` and `incident_type: null` both
correctly produce `category: null`, and the caller
(`retrieveIncidentKnowledge`) passes `category: context.category ??
undefined` to `retrieveRelevantChunks`, which — per `lib/rag/retrieval.ts`
— treats an omitted/`undefined` category as "no filter," never as
`"general"`. The `"other" -> "general"` mapping the plan repeatedly warns
against is not present anywhere in this code.

**Incident-type query term:** `"building_collapse"` becomes `"building
collapse"` (underscore replaced with a space) via a small dedicated
function, kept separate from the UI's `INCIDENT_TYPE_LABELS` display
strings (`app/incidents/[id]/page.tsx`) — that table produces
capitalized display copy like "Missing Person" for a different purpose
and was not reused, since a lowercase, space-separated phrase is what a
search query wants.

---

## Retrieval behavior

- **Existing function reused as-is:** `retrieveRelevantChunks` from
  `lib/rag/retrieval.ts` is imported and called directly — no new
  embedding call, no new Supabase RPC, no second retrieval
  implementation. `lib/rag/retrieval.ts` itself was not modified.
- **Category filter:** passed through exactly as described above —
  present when a valid mapping exists, omitted (via `undefined`, not
  `null`) otherwise.
- **Language:** omitted entirely, per the M14-B decision (English-only
  M11 corpus; `incident.language` is not the validated `KnowledgeLanguage`
  union). `retrieveIncidentKnowledge` never references
  `incident.language` at all — it isn't even part of `IncidentContextInput`.
- **Empty-result behavior:** `retrieveIncidentKnowledge` returns whatever
  `retrieveRelevantChunks` returns, completely unmodified. A successful
  search with zero matching chunks (`{ ok: true, data: [] }`) is passed
  straight through — this module does not interpret, wrap, or convert it
  into any kind of error or into a `knowledgeFound` flag (that
  interpretation is explicitly left to M14-D/E, per the module prompt's
  scope boundary).
- **Retrieval-error behavior:** likewise, `{ ok: false, reason, message }`
  is passed straight through with its original `reason` value
  (`missing_api_key | provider_error | database_error`) intact and
  distinguishable from the empty-result case. Verified by test (see
  below) using an injected fake retrieval function, since exercising the
  real failure paths would require live Gemini/Supabase access this
  sandbox doesn't have.

---

## Security

- **Untrusted reporter text:** `summary`/`report_text` are treated as
  plain data throughout — normalized and bounded, never parsed,
  evaluated, or treated as instructions. See the in-file "PROMPT-INJECTION
  BOUNDARY" doc comment at the top of `intelligence-context.ts` for the
  full reasoning: at this stage the text is only ever folded into a
  string later sent to an *embedding* call (same trust level `/ask`'s
  user-typed question already has), never read by an LLM as a
  system/instruction channel — that channel doesn't exist until M14-D/E's
  generation step, which is out of scope here.
- **No injection-detection logic was added.** This was a deliberate
  choice, not an oversight: attempting to detect/strip phrases like
  "ignore previous instructions" at the search-query stage would be both
  ineffective (the real boundary belongs in the M14-D/E generation
  prompt, where an LLM actually reads text as potential instructions) and
  scope creep the module prompt explicitly warns against ("do not
  over-engineer semantics").
- **No secrets:** this module makes no API calls to Gemini directly, has
  no knowledge of `GEMINI_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` /
  `RAG_INGEST_SECRET`, and never touches the client/browser — it's
  imported only by (future) server-side code (M14-E's API route).
  `retrieveRelevantChunks` itself (unmodified) is the only thing here
  that talks to Supabase/Gemini, exactly as it already did for `/ask`.

---

## Tests

**EXECUTED AND PASSED:** none. `npm install` fails in this sandbox with
`403 Forbidden` from the npm registry (network egress is disabled per
this environment's configuration — identical constraint documented in
HANDOFF_M14B.md), so `node_modules` does not exist and neither
`npx tsc --noEmit` nor `npx tsx` can run here.

**CODE VERIFIED BUT NOT EXECUTED:**

- `lib/incidents/intelligence-context.test.ts` — all 9 required test
  groups from the module prompt are present:
  1. Flood — structured facts produce a query containing the expected
     terms and `category: "flood"`.
  2. `"other"` — `category: null`, and the literal word "other" never
     appears in the query.
  3. `null` incident type — `category: null`.
  4. Critical indicators — each of the 5 boolean indicators appears when
     `true` and is absent when `false`.
  5. Empty text — null/empty `summary`/`report_text` (including
     whitespace-only strings) never throws and always produces a
     non-empty query.
  6. Bounded text — a ~12,000-character `report_text` still produces a
     query ≤ 300 characters.
  7. Untrusted/instruction-like text — an injection-style string is
     folded into the query verbatim (as plain data) and does not affect
     the deterministic category mapping.
  8. Retrieval empty result — via an injected fake `retrieveFn` returning
     `{ ok: true, data: [] }`, confirms `retrieveIncidentKnowledge`
     preserves that shape exactly rather than converting it into an
     error.
  9. Retrieval failure — via a second injected fake `retrieveFn`
     returning `{ ok: false, reason: "database_error", ... }`, confirms
     the failure (and its specific `reason`) survives unchanged and stays
     distinguishable from Test 8's empty-but-successful result.

  I manually traced every assertion in this file against the actual
  `buildIncidentContext`/`retrieveIncidentKnowledge` implementation
  line-by-line while writing it (not a separate pass after the fact) —
  including one real bug this caught before it shipped: an initial draft
  had an unreachable `FALLBACK_QUERY` branch (the closing phrase was
  already unconditionally appended, so the "empty composed string"
  condition the fallback existed for could never actually occur) with a
  docstring that inaccurately described that dead branch as live
  behavior. This was fixed by removing the unreachable branch and
  correcting the docstring to describe what the code actually guarantees
  — but this is still traced-by-inspection, not executed. Tests 8 and 9
  specifically were designed with the `retrieveFn` injection parameter
  *because* the real retrieval path cannot be exercised offline (it calls
  Gemini's embedding API and Supabase), so — unlike a live end-to-end
  retrieval test, which remains genuinely BLOCKED — these two cases are
  at least structurally testable without network access, once `npx tsx`
  is actually runnable.

- `npm run lint` / `npx tsc --noEmit` — not run, same network-access
  cause. The new file was written to match the existing codebase's
  patterns closely (import style, `type` re-exports, optional-chaining
  conventions already used elsewhere in `lib/`), but this has not been
  confirmed by an actual compiler pass.

**BLOCKED:** any test requiring a real `retrieveRelevantChunks` call
(live Gemini embedding + Supabase `match_knowledge_chunks` RPC) —
consistent with every module since M07 per `CURRENT_STATE.md`, which
notes no live Supabase/Gemini credentials have been available in this
environment for any prior module either. This is not new to M14-C.

---

## Files Changed

- `lib/incidents/intelligence-context.ts` (new)
- `lib/incidents/intelligence-context.test.ts` (new)
- `HANDOFF_M14C.md` (new, this file)

## Database Changes

No database schema changes.

## Known Limitations

- Test execution is blocked in this sandbox (no npm registry access);
  see Tests section for the precise CODE VERIFIED / BLOCKED split. This
  should be re-run with `npm install && npx tsc --noEmit && npx tsx
  lib/incidents/intelligence-context.test.ts` in an environment with
  registry access before M14-D treats this module as fully verified.
- The 160-character text-excerpt bound and 300-character total query
  bound are both this session's own reasonable defaults, not values
  specified by the M14-C prompt (which only said "bounded" / "concise" /
  "not unnecessarily long" without a number). Documented in-file with
  their rationale; revisit if real retrieval testing shows they're too
  tight or too loose once live credentials are available.
- The closing phrase `"emergency response guidance"` appended to every
  query is this session's own deterministic choice for a generic,
  non-fabricated closing term (the module prompt's examples used
  different closing phrases per category and explicitly said those were
  "style only, do not hard-code fake facts") — a single fixed phrase was
  chosen over per-category closing phrases specifically to avoid
  hard-coding category-specific "facts" the module prompt warned against.
- `CURRENT_STATE.md` is stale — it still describes "Current Module: M12"
  and doesn't mention M13 or M14 at all. Not touched in this part (out of
  scope for M14-C), but worth flagging since a future reader skimming
  only that file would miss that M13, M14-A, M14-B, and M14-C all already
  exist.

## Next Module

M14-D — Knowledge Retrieval Integration / retrieval behavior refinement.

What remains for M14-D and beyond: M14-C produces a query + category and
hands off to the existing, unmodified retrieval function, preserving its
exact ok/empty/error semantics — nothing here decides what
`knowledgeFound` means for the API contract, nothing here calls Gemini,
and nothing here builds the generation prompt. Per HANDOFF_M14B.md, the
persistence question (Option B — no schema change yet, with the
`intelligence`/`intelligence_generated_at` JSONB-on-`incidents` column
recommendation flagged for M14-E) also remains open and unaffected by
this part.

---

STOP — M14-C complete. Not starting M14-D, M14-E, M14-F, M14-G, M14-H, or
M14-I. Awaiting direction.
