# HANDOFF_M14G.md

## Module

M14-G — Incident Intelligence UI

## Status

Complete with documented limitations (browser-rendered success/no-knowledge
states not observed live — no Gemini/Supabase credentials in this
environment; see Tests below for the exact PASS/CODE-VERIFIED/NOT-RUN
breakdown).

---

## UI

**Location:** `components/incidents/incident-intelligence.tsx`
(`IncidentIntelligenceSection`), rendered as the last child inside
`PageShell` in `app/incidents/[id]/page.tsx` — after the existing
two-column grid (Situation / Affected People / Important Indicators /
Needs / Priority Explanation / Reported Location), not interleaved with
or replacing any of it. Every existing section's markup, text, and
logic is byte-for-byte unchanged; the only edits to `page.tsx` are one
new import and one new component instantiation
(`<IncidentIntelligenceSection incidentId={incident.id} />`).

**Analyze Incident action.** A single `<Button>` (existing `Button`
primitive, `variant="secondary"`) in the section's header. Its
`onClick` is the *only* code path that calls `analyze()` — there is no
`useEffect` anywhere in the new file, and the pre-existing `useEffect`
in `page.tsx` (which fetches the incident itself) was not modified and
has no relationship to this button. Confirmed by `grep -n "useEffect"
components/incidents/incident-intelligence.tsx` returning only the
doc-comment sentence explaining its absence.

**Loading behavior.** While a request is in flight: the button is
`disabled` and carries `aria-busy="true"`; the button label changes to
"Analyzing incident…"; a `role="status"` region shows a spinner (same
markup/classes as `app/ask/page.tsx`'s existing loading spinner, for
visual consistency) and the text "Reviewing the incident against
verified RescueMesh knowledge…" — no fabricated progress percentage, no
claim about what Gemini is doing internally.

**Success rendering (`knowledgeFound: true`).** Assessment paragraph,
then three lists — Recommended actions / Watch for / Information gaps —
each rendered via a shared `IntelligenceList` helper that returns `null`
(renders nothing) when its array is empty, so an empty
`actions`/`watchFor`/`informationGaps` never produces a labeled-but-empty
card or placeholder text like "No actions available." Then a source
list (only rendered when `sources.length > 0`).

**No-knowledge rendering (`knowledgeFound: false`).** A `warning`-variant
badge reading "No verified knowledge found" plus the API's own
`assessment` string (the fixed, controlled explanatory text M14-E
already generates for this case — not new copy invented in this
module). No actions/watchFor/informationGaps/sources are rendered in
this branch (the M14-B/E contract already guarantees they're empty
arrays here; this component additionally never renders those lists at
all when `knowledgeFound` is `false`, as a second guarantee against
ever showing generated recommendations alongside a "no knowledge"
result).

**Error states.** A `role="alert"` paragraph in `text-destructive`,
using the JSON response's own `error` string when present, or
`fallbackErrorForStatus(response.status)` (reused unmodified from
`lib/incidents/intelligence-client.ts`, M14-B) otherwise — covering 400
("Unable to analyze this incident — invalid request."), 404 ("This
incident could not be found." — not currently reachable from this UI
since the incident itself must have already loaded for the button to
render, but included for completeness/future-proofing since the
fallback function already defines it), 429 ("RescueMesh AI is
temporarily rate-limited. Please try again shortly."), 503 ("RescueMesh
AI is temporarily unavailable. Please try again later."), and a generic
fallback for any other status. Malformed JSON and an unexpected-shape
`200` response (fails `isIncidentIntelligenceData`) both route to the
same generic "sent back a response we couldn't understand" message
rather than being rendered as if they were valid guidance. A network
failure (`fetch` itself rejecting) shows "Couldn't reach RescueMesh AI.
Check your connection and try again." After any error, the button
returns to an enabled, clickable state ("Analyze Again") — no automatic
retry, no retry loop.

**Source rendering.** Only `title`/`slug`/`category` are ever read from
a source object (matching `IncidentIntelligenceSource`'s actual three
fields) — no invented URL/author/date/score. When `title` is present it
is shown as the card's primary text; when only `category` is available,
the category's display label is shown as the primary text instead
(never rendered as a raw enum string); if genuinely neither is present,
a generic, non-fabricated label ("Verified knowledge source") is shown
rather than inventing a specific-sounding title. A `slug`, if present,
is only ever used as part of the React `key` — never displayed as text
(the module's spec lists `title`/`slug`/`category` as the only fields to
render, but a raw slug string like `flood-immediate-response` is not
meaningful UI copy on its own; it's already implicitly represented by
the title/category shown).

**Responsive behavior.** No fixed widths anywhere in the new file. The
header stacks vertically on narrow screens and goes side-by-side at
`sm:` and up (`flex-col sm:flex-row`); the source grid is
`grid-cols-1 sm:grid-cols-2` (same breakpoint convention as the
existing `RagSources` component); lists wrap naturally as flex/plain
`<ul>` content. No change was made to the page's own responsive grid
(`lg:grid-cols-2`) — the new section sits below it, full width, at every
breakpoint.

**Accessibility.** Real `<button>` (via the existing `Button`
primitive); visible focus ring (inherited from `Button`'s existing
`focus-visible:ring-2` classes, unmodified); `aria-busy` on the button
while loading; `role="status"` for the loading region; `role="alert"`
for the error region; `aria-live="polite"` on the results container
(matching `app/ask/page.tsx`'s existing pattern) so status changes are
announced; semantic `<h4>` headings for each list section (`<h3>
Incident Intelligence` at the card-title level is the existing `Card`
`CardTitle`'s own `<h3>`, kept as the natural section heading);
real `<ul>`/`<li>` for actions/watchFor/informationGaps; severity/state
is never conveyed by color alone (every badge carries a text label —
"AI-assisted guidance", "No verified knowledge found").

---

## API integration

**Endpoint:** `POST /api/incidents/[id]/intelligence` (M14-F, this
module does not modify it in any way).

Confirmed:

- **No request body.** `fetch(..., { method: "POST" })` — no `body`, no
  `Content-Type` header, no incident data of any kind sent. Verified by
  `grep -n -A2 "fetch(\`/api/incidents"` showing only `method: "POST"`.
- **No direct Gemini.** `grep -n "GoogleGenAI\|@google/genai\|GEMINI_API_KEY"
  components/incidents/incident-intelligence.tsx` returns nothing outside
  the file's own doc-comment describing what it does *not* import.
- **No direct service-role Supabase.** `grep -n "createServiceClient\|
  SUPABASE_SERVICE_ROLE_KEY" components/incidents/incident-intelligence.tsx`
  returns nothing outside the same doc-comment.
- **No automatic request.** Confirmed above (no `useEffect` in the new
  file).
- **No persistence.** No `localStorage`/`sessionStorage`/cookie write
  anywhere in the new file (`grep -n "localStorage\|sessionStorage\|
  document.cookie"` returns nothing); component state
  (`status`/`result`/`errorMessage`) lives in `useState` only and resets
  on navigation/refresh, matching the M14-B "Option B" interim
  mitigation (a refresh returns to the un-analyzed state; it never
  auto-re-generates).

---

## Security

- **No client secrets.** Covered above — no `GEMINI_API_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` reference anywhere in the new file.
- **No authoritative-field mutation.** `grep -n "\.update(\|\.insert(\|
  \.upsert(\|priority_score\s*=\|priorityScore\s*=\|\.severity\s*=\|
  \.status\s*=\|incident_type\s*=\|incidentType\s*="
  components/incidents/incident-intelligence.tsx` returns nothing — this
  component has no Supabase import at all and never assigns to any
  authoritative incident field, in this file or in the two-line diff to
  `page.tsx` (the existing `IncidentDetail` state/fetch logic in
  `page.tsx` is completely untouched).
- **No automatic generation.** Only the button's `onClick` calls
  `analyze()` (see UI section above).
- **No invented AI metrics.** No confidence percentage, risk score, or
  model/token/latency readout appears anywhere in the new file — nothing
  in `IncidentIntelligence` carries such a field, and none was added to
  the render.
- **No invented source metadata.** Covered under "Source rendering"
  above — only `title`/`slug`(as key only)/`category` are ever read from
  a source object; no URL, author, date, or score is fabricated.
- **Prompt-injection non-issue at this layer:** this component never
  constructs a prompt or sends any incident text to the API — it sends
  no body at all. The prompt-injection boundary is entirely the
  server's responsibility (M14-C/E, unmodified), which this module does
  not touch.

---

## Tests

No new automated test file was added for this module specifically.
Rationale: the pure, testable logic this UI depends on
(`isIncidentIntelligenceData`, `isIncidentIntelligenceSource`,
`fallbackErrorForStatus`) already exists and is already fully covered by
`lib/incidents/intelligence-client.test.ts` (M14-B, unmodified, 28/28
passing — re-run below) — writing a second test file re-asserting the
exact same validator behavior would duplicate that coverage rather than
add new coverage. `components/incidents/incident-intelligence.tsx`
itself is a React component with no exported pure helpers beyond what
it imports; extracting one for the sole purpose of having a test file
was judged to be manufacturing a seam that doesn't reflect a real reuse
need, per `AGENTS.md`'s "prefer small, simple implementations" —
instead, the UI-specific behaviors (loading/duplicate-submission/
no-auto-request/authoritative-data-untouched) were verified by direct
static grep/inspection against the actual shipped file, listed below
exactly as the module's own required categories:

| # | Requirement | Verification | Result |
|---|---|---|---|
| 1 | Response parsing (valid success) | Reuses `isIncidentIntelligenceData` — already covered by `intelligence-client.test.ts` | **PASS** (existing suite, re-run live) |
| 2 | No-knowledge response | Same validator; `knowledgeFound: false` is a valid, non-error shape per that file's own tests | **PASS** (existing suite, re-run live) |
| 3 | Malformed response | Same validator rejects it; component routes rejection to the generic error message | **PASS** (existing suite) + **CODE VERIFIED** (component branch read directly) |
| 4 | Error envelope (`success: false`) | Component checks `payload.success !== true` before ever calling the validator | **CODE VERIFIED** (static read) |
| 5 | HTTP error (400/404/429/5xx) | `fallbackErrorForStatus` — already covered by `intelligence-client.test.ts` for all 5 branches | **PASS** (existing suite, re-run live) |
| 6 | Loading behavior (button disabled, loading visible, duplicate prevented) | Static read of `analyze()`: `submittingRef` guard is checked/set before any `await`; `disabled={isLoading}` and `aria-busy={isLoading}` are wired to the same `status === "loading"` state | **CODE VERIFIED** — **NOT** browser-tested (no browser/E2E tool available in this environment) |
| 7 | Sources — nullable fields render safely | Static read of `SourceList`: `hasTitle`/`hasCategory` booleans gate every branch; no `null`/`undefined` can reach JSX text | **CODE VERIFIED** |
| 8 | Optional sections — empty arrays don't render | `IntelligenceList` and `SourceList` both `return null` when their array is empty (static read + the same pattern already proven live in `RagSources`, which this mirrors) | **CODE VERIFIED**, pattern **PASS** via precedent |
| 9 | No automatic request on mount | `grep -n "useEffect"` on the new file returns only the doc-comment; confirmed by inspection there is exactly one function (`analyze`) that calls `fetch`, and its only caller is the button's `onClick` | **CODE VERIFIED** (static grep, exact command shown above) |
| 10 | Authoritative data untouched | `grep` for `.update(`/`.insert(`/`.upsert(`/field-assignment patterns returns nothing in the new file; `page.tsx`'s diff is exactly two lines (import + one new JSX element) | **PASS** (grep run live, shown above) |

Additionally executed live in this session (all **PASS**):

```
$ npx tsc --noEmit
app/layout.tsx(11,50): error TS2304: Cannot find name 'LayoutProps'.
lib/incidents/intelligence-context.test.ts(35,5): error TS2322: Type 'null' is not assignable to type 'string'.
lib/incidents/intelligence-context.test.ts(111,56): error TS2322: Type 'null' is not assignable to type 'string | undefined'.
```
— identical to the M14-D/E/F baseline (3 pre-existing errors, none in
any file this module touches). **Zero new errors.**

```
$ npm run lint
components/map/incident-map.tsx: 1 warning (unused eslint-disable directive)
0 errors
```
— identical pre-existing warning. **Zero new lint issues.**

```
$ npx tsx lib/scoring/priority.test.ts                          -> 26 passed, 0 failed
$ npx tsx lib/rag/client-response.test.ts                       -> 22 passed, 0 failed
$ npx tsx lib/incidents/intelligence-category.test.ts           -> 11 passed, 0 failed
$ npx tsx lib/incidents/intelligence-client.test.ts             -> 28 passed, 0 failed
$ npx tsx lib/incidents/intelligence-evidence.test.ts           -> 41 passed, 0 failed
$ npx tsx lib/incidents/intelligence-generation.test.ts         -> 41 passed, 0 failed
$ npx tsx lib/incidents/intelligence-api.test.ts                -> 49 passed, 0 failed
```
— every pre-existing self-running test file still passes, unchanged.

```
$ next dev  (all env vars unset)
GET /                                                      -> 200
GET /dashboard                                             -> 200
GET /report                                                -> 200
GET /ask                                                   -> 200
GET /incidents/00000000-0000-0000-0000-000000000000        -> 200
POST /api/incidents/not-a-uuid/intelligence                 -> 400 "Invalid incident ID."
POST /api/incidents/11111111-.../intelligence               -> 503 "RescueMesh AI is temporarily unavailable. Please try again later."
GET /api/incidents                                          -> 503 (unchanged)
```
All live-verified. **NOT verified live:** the actual rendered DOM after
JavaScript hydration (curl only observes the server-rendered HTML before
the client component's own fetch/render cycle runs) — so while the
`page.tsx`/component source was read and traced by hand to confirm the
"Incident Intelligence" section, the button, and every state render
correctly, this was **not** additionally confirmed via a browser or
headless-browser tool (none is available in this environment). This is
the same class of limitation every prior M14 sub-part has carried
(no live Gemini/Supabase credentials, and now additionally no browser
automation tool), not a new gap introduced here.

---

## Build

**FAIL** — for the exact same pre-existing reason documented since
`HANDOFF_M14D.md`: `lib/incidents/intelligence-context.test.ts`'s two
`report_text: null` type errors (that file belongs to M14-C, out of
scope for M14-G to fix) block `npm run build`'s type-check step. Not a
regression: `npx tsc --noEmit` above shows byte-for-byte the same 3
errors as the documented M14-D/E/F baseline.

---

## Files changed

**Created:**
- `components/incidents/incident-intelligence.tsx`
- `HANDOFF_M14G.md` (this file)

**Modified:**
- `app/incidents/[id]/page.tsx` — exactly two additions: one import
  (`IncidentIntelligenceSection`) and one JSX element
  (`<IncidentIntelligenceSection incidentId={incident.id} />`) placed
  after the existing grid, before the closing `</PageShell>`. No
  existing line was changed, removed, or reordered.
- `CURRENT_STATE.md` — appended an "M14-G" section in the same style
  M14-F used (did not rewrite the stale M12-era header, consistent with
  every M14 sub-part's own precedent).

## Files intentionally untouched

```
lib/scoring/priority.ts, lib/scoring/priority.test.ts
lib/rag/retrieval.ts, lib/rag/generation.ts
app/api/rag/route.ts, lib/rag/client-response.ts
app/ask/*, components/rag/*
app/api/analyze/route.ts, lib/ai/incident-extraction.ts
components/map/*
lib/incidents/intelligence-types.ts
lib/incidents/intelligence-category.ts
lib/incidents/intelligence-context.ts
lib/incidents/intelligence-evidence.ts
lib/incidents/intelligence-generation.ts
lib/incidents/intelligence-client.ts
lib/incidents/intelligence-api.ts
app/api/incidents/[id]/route.ts (existing GET)
app/api/incidents/[id]/intelligence/route.ts (M14-F)
app/api/incidents/route.ts, app/dashboard/page.tsx
```

## Known limitations

- **No live Gemini/Supabase credentials and no browser automation tool
  were available in this environment**, so the actual rendered
  `knowledgeFound: true` result (assessment/actions/watchFor/
  informationGaps/sources all populated from a real Gemini response)
  and the actual rendered `knowledgeFound: false` state were not
  observed in a live browser. Both are CODE VERIFIED (traced against the
  actual implementation and against `IncidentIntelligence`'s real,
  already-tested shape) but not LIVE VERIFIED. This mirrors the standing
  constraint carried since M07, now extended to "no browser tool
  either."
- **`npm run build` fails** for the pre-existing, out-of-scope
  `intelligence-context.test.ts` reason documented since M14-D — not
  introduced or worsened here.
- **No dedicated M14-G test file was written** — see the Tests section's
  rationale (existing `intelligence-client.test.ts` already covers the
  reusable logic; the remaining requirements are UI-behavior claims
  verified by static inspection, listed explicitly with their
  verification type rather than asserted as "tested").
- **The 404 fallback error text is currently unreachable from this UI**
  in practice, since the "Analyze Incident" button only renders once the
  page has already successfully loaded that same incident via
  `GET /api/incidents/[id]` — a 404 from the intelligence endpoint for an
  incident the page just displayed would only happen if the incident
  were deleted between the page load and the button click. The branch is
  still implemented and correct (inherited from
  `fallbackErrorForStatus`), just not exercisable through normal use.

## Explicitly NOT Implemented

```
M14-H — Security + Hardening
M14-I — Final Verification
Persistence of IncidentIntelligence results (Option B remains in effect — no migration, no JSONB column, no localStorage/sessionStorage)
Automatic/background generation of any kind
Authentication/authorization redesign
Any modification to M12 (lib/rag/*, app/api/rag/*) or M13 (app/ask/*, components/rag/*)
Any modification to lib/scoring/priority.ts, incident extraction, or the incident API's existing GET/POST behavior
Chat UX (message history, follow-up questions, streaming, avatars, typing animation)
```

## Next module

M14-H — Security + Hardening

---

**Confirmation:** M14-H and M14-I were **not** started. No persistence
was added. No redesign was performed. No chatbot functionality was
added. No new AI features were introduced beyond wiring the existing
M14-F endpoint into the existing incident detail page.
