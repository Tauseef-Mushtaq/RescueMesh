# HANDOFF_M13.md

## Module

M13 — User-Facing RAG Experience

## Status

COMPLETE WITH DOCUMENTED EXTERNAL LIMITATIONS

All new code builds/lints/type-checks cleanly and the new pure logic
has passing tests. Live end-to-end verification against a real
Gemini/Supabase-backed `POST /api/rag` was not possible in this
session — same standing environment constraint as every module since
M02/M07 (no credentials, no outbound network to
`generativelanguage.googleapis.com`/`*.supabase.co` in this sandbox).
The frontend was instead verified against the real `/api/rag` route
running with no backend configured, which exercises every code path
except the two Gemini/Supabase-dependent branches themselves (see
Testing).

## Objective

M13 exposes the existing, already-verified M12 RAG foundation
(`POST /api/rag`) through a new user-facing "Ask RescueMesh"
experience. No retrieval, generation, embedding, ingestion, or
database logic was rebuilt or modified — this module is a frontend
consumer of that stable API only.

## Features Implemented

- **Route**: `/ask` (`app/ask/page.tsx`), a client component.
- **Navigation integration**: no shared navigation existed anywhere in
  the project before this module (`/`, `/dashboard`, `/report` were
  each standalone pages with no chrome) — added a small
  `components/layout/nav-bar.tsx` (Dashboard / Report / Ask RescueMesh
  links, active-route highlighting) and wired it into `app/layout.tsx`
  so it appears on every page, not just `/ask`.
- **Question input**: labeled `Textarea` (existing M03 primitive),
  500-char limit matching the API's own `MAX_QUERY_LENGTH` exactly,
  live character counter, Ctrl/Cmd+Enter submit shortcut, disabled
  while a request is in flight.
- **Suggested questions**: the 5 example questions from the module
  prompt, rendered as pill buttons; clicking one populates the
  textarea and submits immediately (one request per click — never
  triggers more than one Gemini-backed call).
- **Category filter**: optional `Select` (existing M03 primitive),
  "All categories" plus the 10 real `KnowledgeCategory` enum values
  read directly from `lib/supabase/types.ts` (flood, earthquake, fire,
  building_collapse, medical_emergency, missing_person, road_blockage,
  food_shortage, shelter_need, general) — no invented category values.
  Kept secondary to the natural-language question, per the module
  prompt's guidance.
- **Language UX**: deliberately **not** exposed as a selector. The
  API accepts `English`/`Urdu`/`Roman Urdu`, but the M11 corpus is
  English-only (documented in HANDOFF_M12.md) — adding a language
  picker would imply multilingual coverage that doesn't exist yet.
  The page simply omits the `language` field from its request, so
  retrieval is unfiltered by language (harmless given the current
  English-only corpus).
- **Loading state**: a spinner plus two-phase status text
  ("Searching RescueMesh knowledge…" → "Preparing a grounded
  response…" after 1.4s) — no fake progress percentage, no claim
  about which model is running.
- **Answer display**: `RagAnswer` (`components/rag/rag-answer.tsx`) —
  renders the returned `answer` text, a "Grounded in RescueMesh
  knowledge" trust badge (only when `knowledgeFound: true`), and a
  short, non-dominant safety disclaimer.
- **Source display**: `RagSources` (`components/rag/rag-sources.tsx`)
  — renders only `title`/`slug`/`category`, the exact fields the API
  returns; no similarity score, no URL, no fabricated metadata (the
  API doesn't return a URL or a score to the client at all — see API
  Integration below).
- **No-knowledge state**: when `knowledgeFound: false`, shows a
  "No verified knowledge found" badge plus the required message
  ("RescueMesh could not find trusted guidance for this question in
  its current knowledge base.") and next actions (try a suggestion,
  go to the dashboard) — never a fabricated answer or source, and the
  trust badge never renders in this branch.
- **Error handling**: every response path (missing/wrong body, `400`,
  `429`, `500`, `502`, `503`, network failure, JSON-parse failure,
  and a payload that passes `response.ok` but doesn't match the
  expected shape) resolves to a plain-language message in an
  `role="alert"` card — see Testing for exactly which of these were
  exercised live in this session.
- **Rate-limit handling**: `429` is mapped to
  "You're asking RescueMesh too quickly. Please wait a moment and try
  again." — but in practice the server's own `error` string is shown
  when present (it already returns a controlled, non-leaking message
  for every failure mode), and the client-side mapping in
  `lib/rag/client-response.ts` is only a backstop for the rare case
  where the API response is missing an `error` field.
- **Double-submit prevention**: the submit button disables while
  `status === "loading"`, and a `submittingRef` guards
  `submitQuestion()` itself against a second call landing before the
  state update re-renders the disabled button.
- **Responsive design**: `PageShell` (existing, already
  responsive) constrained to `max-w-3xl` for readability; source cards
  use a 1-column/2-column responsive grid (`sm:grid-cols-2`); no fixed
  widths that could overflow on mobile.
- **Accessibility**: labeled textarea/select, `aria-live="polite"` on
  the result region, `role="status"` on the loading card, `role="alert"`
  on the error card, visible focus rings (inherited from the existing
  `Button`/`Textarea`/`Select` primitives), suggestion buttons and the
  submit button are real `<button>` elements (keyboard-operable by
  default), no color-only state (every severity/trust state pairs a
  badge with text, matching the existing project convention from
  M08/M10).

## API Integration

The frontend calls the existing `POST /api/rag` exactly as implemented
— no changes were made to `app/api/rag/route.ts`,
`lib/rag/retrieval.ts`, `lib/rag/generation.ts`, `lib/ai/embeddings.ts`,
or `lib/rag/ingest.ts`. The shape below was read directly from
`app/api/rag/route.ts`, not assumed:

**Request** (`Content-Type: application/json`):
```json
{ "query": "string, 1-500 chars", "category": "optional KnowledgeCategory enum value", "language": "optional, not sent by this UI" }
```

**Success response** (`200`):
```json
{
  "success": true,
  "data": {
    "answer": "string",
    "sources": [{ "title": "string | null", "slug": "string | null", "category": "KnowledgeCategory | null" }],
    "knowledgeFound": true,
    "retrievedChunks": 5
  }
}
```
(`knowledgeFound: false` responses have `sources: []`,
`retrievedChunks: 0`, and a fixed no-knowledge `answer` string — Gemini
is never called in that branch, per the existing M12 implementation.)

**Error response** (`400`/`429`/`500`/`502`/`503`):
```json
{ "success": false, "error": "string" }
```

The client's `isRagSuccessData()` type guard
(`lib/rag/client-response.ts`) validates this exact shape at runtime
before rendering anything as a real answer — an unexpected shape is
treated as an error, never silently coerced.

## Testing

| Test | Result | Notes |
|---|---|---|
| Empty query validation | CODE VERIFIED (unit test) | `lib/rag/client-response.test.ts` — `isValidQuestion("")` / `isValidQuestion("   ")` → `false`; submit button is also disabled client-side via the same helper |
| Query length limit | CODE VERIFIED (unit test) | Exactly `MAX_QUERY_LENGTH` chars → valid; `MAX_QUERY_LENGTH + 1` → invalid, matching the server's own check |
| Successful API request handling | LIVE VERIFIED (partial) | `POST /api/rag` with a valid question reaches the server, passes request validation, and fails only at the (expected, unconfigured) embedding step — `503 "Embedding generation is currently unavailable."` — confirming the request path end-to-end up to the Gemini call itself. The actual `knowledgeFound: true` render path is CODE VERIFIED only (see below) |
| `knowledgeFound: true` rendering | CODE VERIFIED (unit test + code review) | `isRagSuccessData()` correctly accepts a well-formed `knowledgeFound: true` payload (unit test); `RagAnswer`/`RagSources` render the exact fields present — not live-rendered against a real Gemini answer in this session |
| Answer rendering | CODE VERIFIED | `RagAnswer` renders `data.answer` verbatim (whitespace-preserved), no truncation/reformatting that could misrepresent it |
| Sources rendering | CODE VERIFIED | `RagSources` renders only `title`/`category` (falls back to "Untitled source" for a null title — a label, not invented data); category mapped through the same 10-value enum as the request filter |
| `knowledgeFound: false` rendering | CODE VERIFIED (unit test + code review) | `isRagSuccessData()` correctly accepts a well-formed `knowledgeFound: false` payload; the no-knowledge branch in `app/ask/page.tsx` is gated on `!result.knowledgeFound` and never renders the trust badge |
| No-source behavior | CODE VERIFIED | `RagSources` returns `null` (renders nothing) when `sources.length === 0`, so the no-knowledge state never shows an empty "Sources" heading |
| API `400` handling | LIVE VERIFIED | `POST /api/rag` with `{"query":""}` → `400 {"success":false,"error":"Invalid or incomplete query."}`; the UI's client-side validation prevents this from being reachable through the form itself, but the fetch handler correctly surfaces the server's message if it ever occurred |
| API `429` handling | LIVE VERIFIED | 21 rapid requests against the real rate limiter (20/min) → the 21st returned `429 {"success":false,"error":"Too many requests. Please try again shortly."}`; the UI displays `payload.error` directly |
| API `500`/`503` handling | LIVE VERIFIED (503) / CODE VERIFIED (500) | `503` observed live (`"Embedding generation is currently unavailable."`, no Supabase/Gemini config); `500` (database error path in `retrieveRelevantChunks`) not reproducible without a live-but-broken Supabase connection — handled identically in code (`payload.error` shown, `fallbackErrorForStatus(500)` as backstop) |
| Loading state | CODE VERIFIED | Two-phase message + spinner confirmed by code review; not something curl can exercise (requires the actual in-flight `fetch` from a browser) |
| Duplicate submission prevention | CODE VERIFIED | `submittingRef` + `disabled={status === "loading"}` on the submit button, confirmed by code review; not exercised by an automated click-spam test in this session |
| Malformed response handling | CODE VERIFIED (unit test) | `isRagSuccessData()` rejects `null`, `undefined`, a bare string, `{}`, and objects missing/mistyping any one of the four required fields — 9 explicit cases in `lib/rag/client-response.test.ts` |
| lint | PASS | `npm run lint` — 0 errors; 1 pre-existing, unrelated warning in `components/map/incident-map.tsx` (M10/M12 scope, not touched here) |
| TypeScript | PASS | `npx tsc --noEmit` — 0 errors |
| build | PASS | `npm run build` — all 12 routes compile, including the new `○ /ask` |
| route reachable | LIVE VERIFIED | `GET /ask` → `200` via `next dev`; confirmed the response HTML contains "Ask RescueMesh", "Your question", and "Suggested questions" |
| navigation | LIVE VERIFIED | `GET /dashboard`'s HTML contains `href="/ask"`, confirming the new nav bar renders on an existing page |
| mobile/responsive | NOT LIVE VERIFIED | No visual/browser rendering available in this sandbox; verified only by code review of the Tailwind classes used (max-width container, responsive grid, no fixed pixel widths) |
| accessibility | CODE VERIFIED | Labels, `aria-live`/`role="status"`/`role="alert"`, real `<button>` elements, focus rings inherited from existing primitives — confirmed by code review; not run through an automated a11y scanner (none is installed in this project) |
| regression: `GET /` | LIVE VERIFIED | `200` |
| regression: `GET /dashboard` | LIVE VERIFIED | `200` |
| regression: `GET /report` | LIVE VERIFIED | `200` |
| regression: `GET /incidents/[id]` | LIVE VERIFIED | `200` (placeholder UUID) |
| regression: `GET /api/incidents` | LIVE VERIFIED | Controlled `503` (no Supabase config — expected, unchanged from every prior module) |
| regression: map | CODE VERIFIED | `components/map/incident-map.tsx` was not modified in this module; `/dashboard` (which renders it) still returns `200` with no runtime errors in the dev server log |

## Security

- No `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or
  `RAG_INGEST_SECRET` appears anywhere in `app/ask/page.tsx`,
  `components/rag/*`, `components/layout/nav-bar.tsx`, or
  `lib/rag/client-response.ts` — confirmed by grep (none of these
  files reference `process.env` at all; secrets are read exclusively
  server-side inside the existing, unmodified `app/api/rag/route.ts`
  and its `lib/rag/*`/`lib/ai/*` dependencies).
- The frontend calls only `POST /api/rag` via `fetch` — it never
  imports `@google/genai`, `lib/supabase/server`, or any other
  server-only module, and every new file that touches the network is
  a `"use client"` component making a same-origin `fetch` call.
- No new logging was added anywhere. The page does not `console.log`
  the user's question or the API response.
- The category `<select>` only ever sends one of the 10 real enum
  values (or omits the field for "All categories") — never
  user-supplied free text — so it cannot be used to inject an
  unexpected `category` value into the request body.

## Files Changed

New:
- `app/ask/page.tsx`
- `components/rag/rag-answer.tsx`
- `components/rag/rag-sources.tsx`
- `components/layout/nav-bar.tsx`
- `lib/rag/client-response.ts`
- `lib/rag/client-response.test.ts`
- `HANDOFF_M13.md`

Modified:
- `app/layout.tsx` — added the `<NavBar />` import and render call
  above `{children}`. No other change.
- `CURRENT_STATE.md` — updated to record M13 (see below; not shown in
  this list again).

No other files were changed. In particular: `app/api/rag/route.ts`,
`lib/rag/retrieval.ts`, `lib/rag/generation.ts`, `lib/ai/embeddings.ts`,
`lib/rag/ingest.ts`, `app/api/rag/ingest/route.ts`,
`components/map/incident-map.tsx`, `app/dashboard/page.tsx`,
`app/report/page.tsx`, `app/incidents/[id]/page.tsx`, and every
migration were **not** touched.

## Database Changes

No database schema or RLS changes were required for M13.

## Dependencies

No new dependencies. `app/ask/page.tsx` and its new components are
built entirely from existing M03 primitives (`Card`, `Badge`, `Button`,
`Select`, `Textarea`) and existing layout components (`PageShell`,
`SectionHeader`); `components/layout/nav-bar.tsx` uses only
`next/link` and `next/navigation`'s `usePathname`, both already part
of the installed `next` package. The new test file uses `tsx`
(already used for `lib/scoring/priority.test.ts` since M06 — not
newly added).

## Known Limitations

- Gemini free-tier request quota and transient 503/high-demand
  responses remain an external limitation (documented in
  HANDOFF_M12.md) — the "Ask RescueMesh" UI surfaces these as the
  "temporarily unavailable" / rate-limit messages, but cannot make the
  underlying quota larger.
- The knowledge corpus (M11) is still English-only. The UI does not
  offer a language selector for this reason (see Features
  Implemented) rather than presenting a misleading multilingual
  affordance.
- Rate limiting is still the M12 in-memory/per-process limiter — a
  best-effort throttle, not a hard guarantee across serverless
  instances. Unchanged by this module.
- Live rendering of a real `knowledgeFound: true` answer with real
  sources, and a real `knowledgeFound: false` no-knowledge response
  from an actually-configured backend, were not observed in this
  session (no Supabase/Gemini credentials or network access in this
  sandbox) — only the request-validation, rate-limit, and
  unconfigured-503 paths were live-exercised; the success-path
  rendering is CODE VERIFIED via the unit tests and code review
  described in Testing. A future session with real credentials should
  open `/ask`, submit "What should I do during an earthquake?", and
  confirm the answer/sources/trust-badge render exactly as described
  here, then submit "Roman Empire" and confirm the no-knowledge state
  renders correctly.
- No automated browser/visual testing (mobile layout, keyboard
  navigation, screen-reader behavior) was performed — Tailwind
  responsive classes and semantic HTML were reviewed by hand, but not
  rendered in an actual browser or verified with an accessibility
  tool.
- The pre-existing critical `maplibre-gl@4.7.1` `npm audit` finding
  (documented in HANDOFF_M12.md) remains unaddressed, as required —
  M13 did not touch the map stack.

## Final Recommendation

M13 is complete. The existing RAG foundation is now exposed through a
user-facing Ask RescueMesh experience, with the external Gemini
quota/corpus-language limitations documented above (not addressed by
adding another provider or fabricating multilingual coverage, per
explicit instruction). M14 has not been started.
