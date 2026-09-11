# HANDOFF_M14D.md

## Module

M14-D — Retrieval Quality + Incident Knowledge Selection

## Status

COMPLETE

---

## Implemented

- `lib/incidents/intelligence-evidence.ts` (new)
  - `IncidentKnowledgeEvidence` — `{ title: string | null; slug: string |
    null; category: KnowledgeCategory | null; content: string }`.
  - `IncidentEvidenceResult` — `{ ok: true; evidence:
    IncidentKnowledgeEvidence[] } | { ok: false; reason:
    "missing_api_key" | "provider_error" | "database_error"; message:
    string }` — same reason enum as `RetrievalResult`, values passed
    through unchanged.
  - `selectIncidentKnowledge(retrieval: RetrievalResult):
    IncidentEvidenceResult` — pure, synchronous, no I/O. Converts an
    already-produced `RetrievalResult` (from M12/M14-C, unmodified) into
    the evidence contract.
  - `buildIncidentEvidence(incident, retrieveFn?):
    Promise<IncidentEvidenceResult>` — convenience wrapper that calls the
    existing M14-C `retrieveIncidentKnowledge` (unmodified) and pipes its
    result through `selectIncidentKnowledge`, so M14-E has a single
    entry point without duplicating M14-C's query-building/retrieval
    wiring itself. `retrieveFn` forwards to the same injection point
    M14-C already exposes, for offline testing.
- `lib/incidents/intelligence-evidence.test.ts` (new) — 9 test groups
  (matching module prompt section 19's Test 1–9), self-running
  assertion script, `npx tsx` convention.
- `HANDOFF_M14D.md` (new, this file).

No existing file was modified. No database migration was created. Gemini
is never called by this module (`grep -rn "generateContent\|GoogleGenAI"
lib/incidents/intelligence-evidence.ts` returns nothing).

---

## Evidence contract

```ts
interface IncidentKnowledgeEvidence {
  title: string | null;
  slug: string | null;
  category: KnowledgeCategory | null;
  content: string;
}
```

Exposed to M14-E: exactly these four fields, taken verbatim from the
existing `RetrievedChunk` (`lib/rag/retrieval.ts`, M12) — `title`,
`slug`, `category` are copied as-is (including `null`), `content` is
copied as-is (the full retrieved chunk text, not a snippet/summary).

Deliberately **not** exposed: `id`, `sourceId`, `chunkIndex`,
`similarity`, `documentId`, `language` (all present on `RetrievedChunk`
but not needed for grounding, and `similarity`/internal IDs specifically
should not leak into the generation layer per module prompt sections 6
and 8). No field is invented that `RetrievedChunk` doesn't already
carry — no URL, author, publication date, agency, confidence, or score
(module prompt section 7, AGENTS.md's "never fabricate a source or
citation").

---

## Retrieval behavior

- **Existing retrieval reused as-is.** `selectIncidentKnowledge` takes a
  `RetrievalResult` produced elsewhere (M12's `retrieveRelevantChunks` /
  M14-C's `retrieveIncidentKnowledge`) — it does not call Supabase, does
  not call the embedding API, and does not construct its own RPC call.
  `lib/rag/retrieval.ts` and `lib/incidents/intelligence-context.ts` are
  both unmodified.
- **Empty result:** `{ ok: true, data: [] }` in -> `{ ok: true, evidence:
  [] }` out. Verified by Test 2. Not treated as an error, no fallback
  content is substituted (module prompt sections 12-13).
- **Error result:** `{ ok: false, reason, message }` in -> the identical
  `{ ok: false, reason, message }` shape out, with `reason` unchanged.
  Verified by Test 3 for both `database_error` and `provider_error`,
  confirming the two stay distinguishable from each other and from the
  empty-success case.
- **Category behavior:** unchanged from M14-C. This module does not read
  or reinterpret `incident_type` or the mapped `KnowledgeCategory` at
  all — it only reads each individual chunk's own `category` field (its
  actual knowledge-document metadata, which may or may not equal the
  filter category that was passed to retrieval). Test 7 confirms the
  M14-C wiring itself is untouched by calling `buildIncidentEvidence`
  with a fake `retrieveFn` and asserting the category it receives still
  matches M14-B's mapping (`flood -> "flood"`, `other -> undefined`, no
  `"other" -> "general"` substitution).
- **Language behavior:** unchanged — this module has no notion of
  language at all; `IncidentKnowledgeEvidence` doesn't carry `language`,
  and `buildIncidentEvidence` never references `incident.language`,
  consistent with the M14-B decision to omit language filtering
  entirely.
- **Top-K behavior:** unchanged — evidence count is always exactly the
  retrieved chunk count (M12's existing `topK`/`MAX_TOP_K` bounds apply
  upstream, before this module ever sees the data). Verified by Test 9.

---

## Source provenance

`title`, `slug`, `category` are preserved exactly as retrieved,
including when any of them is legitimately `null` (Test 4 covers both
the present and the all-`null` case explicitly). No provenance field is
dropped, renamed, or reformatted.

---

## Content handling

- **Preserved as-is.** `content` is copied verbatim from
  `RetrievedChunk.content` — not paraphrased, summarized, reformatted,
  or otherwise modified (Test 5).
- **Not truncated.** No additional character/word bound is applied in
  this module. Reasoning (module prompt section 15's preference order):
  each chunk's content is already bounded by M12's deterministic
  chunker (`MAX_CHUNK_WORDS = 320` in `lib/rag/chunking.ts`, roughly
  2,200 characters), and the number of chunks is already bounded by
  `retrieveRelevantChunks`'s `topK` (default 5, hard max 20 — enforced
  both in the caller and inside the `match_knowledge_chunks` SQL
  function itself). Both of these are pre-existing, already-verified
  bounds; adding a third truncation step here would be redundant and
  risked being an arbitrary number invented "for the sake of having
  one," which the module prompt explicitly warns against. Test 9
  explicitly asserts this: evidence-array length always equals
  retrieved-chunk-array length, and individual chunk content length is
  never shortened by this module.
- **Deduplicated — narrowly.** `dedupeById` removes only exact duplicate
  chunk rows (same `id` appearing twice in one retrieval result — a
  defensive safety net, not an expected case). Multiple *distinct*
  chunks from the same source document (different `id`/`chunkIndex`/
  `content`) are always preserved — Test 8 covers both: two different
  chunks from one document both survive, while two entries sharing the
  same `id` collapse to one. This matches module prompt section 16's
  instruction not to deduplicate by document merely because duplicates
  are theoretically possible, while still guarding against the one case
  (identical `id`) that has no legitimate reason to appear twice.

---

## Security

- Knowledge `content` and reporter-derived query text remain plain data
  throughout this module — never parsed, evaluated, or treated as
  instructions. No prompt is constructed here; that boundary belongs to
  M14-E, which has not been implemented.
- No Gemini call, no new Supabase call, no new API route. This module
  has no knowledge of `GEMINI_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY`,
  never touches the client/browser, and is importable only from
  server-side code (it re-exports nothing that isn't already
  server-only via its `lib/rag/retrieval` and
  `lib/incidents/intelligence-context` imports).
- No logging was added. This module doesn't log anything at all
  (success or failure) — logging of retrieval-level errors already
  happens once, inside `lib/rag/retrieval.ts` (dev-only, message-only,
  unmodified); adding a second log line here would either duplicate
  that or risk logging evidence `content` (verified-but-still-external
  text), which isn't warranted for a pure data-shaping step.

---

## Tests

**EXECUTED AND PASSED:** `npx tsx lib/incidents/intelligence-evidence.test.ts`
— **41 passed, 0 failed**, run live in this session (this sandbox had
npm registry access this time; `npm install` succeeded, unlike the
network-restricted sandboxes M14-B/M14-C ran in).

All 9 required test groups from module prompt section 19 are present and
executed, not just written:

1. Successful evidence — one chunk in, one evidence item out, content
   matches.
2. Empty retrieval — `{ ok: true, data: [] }` -> `{ ok: true, evidence:
   [] }`.
3. Retrieval failure — `database_error` and `provider_error` both
   preserved with original reason/message, stay distinguishable from
   each other.
4. Source provenance — title/slug/category preserved exactly, both when
   present and when `null`.
5. Knowledge content — verbatim preservation of a multi-sentence content
   string.
6. No invented metadata — asserts the evidence object has *exactly*
   `{title, slug, category, content}` as keys (nothing more, nothing
   less), and explicitly checks 13 specific fields (internal
   `RetrievedChunk` fields plus every plausible invented metadata field)
   are all absent.
7. Category behavior — `buildIncidentEvidence` with an injected fake
   `retrieveFn` confirms `flood -> "flood"` and `other -> undefined`
   still reach retrieval correctly (M14-C wiring unchanged).
8. Multiple chunks — two distinct chunks from one source both survive;
   an exact duplicate `id` collapses to one.
9. Bounded evidence — evidence-array length always equals retrieved-
   chunk-array length; individual content length is never shortened;
   this explicitly documents/verifies the "rely on existing M12 bounds,
   add no new one" decision.

**Additional verification, also executed live:**

- `npx tsc --noEmit` — zero errors in any file this module touches.
  Three pre-existing errors remain, all unrelated and out of scope:
  `app/layout.tsx` (`LayoutProps`, pre-existing before this module) and
  two in `lib/incidents/intelligence-context.test.ts` (M14-C's own test
  file passing `report_text: null` where `IncidentRow.report_text` is
  typed as non-nullable `string` — a real pre-existing defect in M14-C's
  test file, not fixed here per the "stable files" boundary in module
  prompt section 22; flagged below instead). My own new test file
  originally copied the same `report_text: null` pattern from that
  precedent and hit the identical type error — caught by `tsc` before
  claiming this "passed," then fixed to `report_text: ""` in my file
  only.
- `npx eslint lib/incidents/intelligence-evidence.ts
  lib/incidents/intelligence-evidence.test.ts` — 0 errors, 0 warnings.
- `npx eslint .` (whole repo) — 0 errors; 1 pre-existing, unrelated
  warning in `components/map/incident-map.tsx` (unused eslint-disable
  directive), present before this module and outside its scope.
- `npm run build` — not run this session (not required for a pure
  library-module part with no route/UI changes); `tsc --noEmit` and
  `eslint` both passing on every file this module touches is the
  relevant signal for M14-D specifically.

No live Gemini or Supabase calls were made — this module makes none by
design (see "Security" above), so there was nothing live to test beyond
what the injected-`retrieveFn` tests already cover.

---

## Database

No database schema changes.

---

## Known limitations

- **Pre-existing type errors in M14-C's own test file**
  (`lib/incidents/intelligence-context.test.ts`, two occurrences of
  `report_text: null` against a non-nullable `string` field) were
  discovered while writing this module's test file but were **not**
  fixed, per the module prompt's "stable files" instruction (M14-D
  should not expand scope into M14-C) — flagging here rather than
  silently leaving it undocumented. This does not affect M14-D's own
  correctness (my test file uses `report_text: ""` instead), but a
  future module (or a dedicated fix) should correct M14-C's test file
  so `npx tsc --noEmit` is fully clean.
- `intelligence-context.ts`'s `boundedExcerpt(value: string | null, ...)`
  accepts `null` defensively even though `IncidentRow.report_text` is
  actually typed `string` (never `null`) — harmless (a stricter runtime
  guard than the type requires), but noting it since it's adjacent to
  the type mismatch above and might otherwise look like an oversight.
- No live end-to-end retrieval (real Gemini embedding + real Supabase
  `match_knowledge_chunks` RPC) was exercised by this module's tests —
  consistent with every prior module since M07 per `CURRENT_STATE.md`.
  This is not a new limitation introduced by M14-D; `selectIncidentKnowledge`
  itself has zero I/O and is fully covered by direct unit tests (Tests
  1–6, 8–9), and the retrieval call itself remains M12/M14-C's already-
  documented responsibility.

---

## Next module

M14-E — Grounded Intelligence Generation
