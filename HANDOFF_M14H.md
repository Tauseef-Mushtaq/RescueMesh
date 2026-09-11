# HANDOFF_M14H.md

## Module

M14-H — Final Hardening Verification (H1: security review, H2: cleanup + live verification)

## Status

**Complete.** M14-H1's security audit was not repeated. M14-H2 fixed
the two known TypeScript test errors, confirmed `LayoutProps<"/">`
was never a source problem, and ran live verification — this
environment had working network access and `node_modules` installed
cleanly, unlike M14-H1's environment.

---

## H1 security result

No concrete security issue was found in any of the four required
areas (API error sanitization, AI authority-field isolation,
no-knowledge safety, secret/client boundary). No code was changed in
H1. Full detail in `HANDOFF_M14H1.md`; not re-audited here per the
module prompt's explicit instruction not to repeat it.

---

## H2 changes

### 1. TypeScript test fixture fix — `lib/incidents/intelligence-context.test.ts`

Both `report_text: null` occurrences (lines 35 and 111) were changed
to `report_text: ""`, **not** `undefined` as H1's handoff speculated.

**Why not `undefined`:** `IncidentContextInput` is
`Pick<IncidentRow, ... | "report_text" | ...>`, and
`IncidentRow.report_text` (`lib/supabase/types.ts`) is typed as
`string` — required, never `| null`, never `| undefined`. So:

- Line 35 builds a full `IncidentContextInput` object literal directly
  (inside `baseIncident`'s return), where `report_text` must be
  `string`. `undefined` is **not** assignable there — the tsc error at
  that line (`Type 'null' is not assignable to type 'string'`) would
  still fire with `undefined` in place of `null`.
- Line 111 passes its object through `Partial<IncidentContextInput>`
  (the `overrides` parameter), where `report_text` becomes
  `string | undefined` — `undefined` *would* have fixed only this one
  occurrence, but not line 35.

`""` is assignable to `string` in both places, so it fixes both
errors uniformly, and it preserves the intended "no report text" test
case: `boundedExcerpt("")` (`intelligence-context.ts`) treats an empty
string exactly like the falsy check it already had for `null`/absent
text (`if (!value) return ""`), so `emptyTextContext`'s "no
type/indicators/text still produces a non-empty fallback query"
assertion (Test 5) is unaffected in behavior.

No production type (`IncidentContextInput`, `IncidentRow`) was
touched — only the two test-fixture literals.

### 2. `LayoutProps<"/">` — `app/layout.tsx`

**Not a source-code problem — confirmed, not just inferred.** This
environment had working `npm install` (M14-H1's did not — no network
access). With `node_modules` present and one `next build` run
completed, `.next/types/root-params.d.ts` (and friends) is generated,
`LayoutProps` resolves, and `npx tsc --noEmit` goes from 1 remaining
error to 0 with zero changes to `app/layout.tsx`. The file was **not
modified** — there was nothing to fix in it.

---

## TypeScript result

`npx tsc --noEmit`: **PASS** (0 errors)

Before the test-fixture fix: 3 errors (1 `app/layout.tsx`, 2
`intelligence-context.test.ts`). After the fixture fix alone
(`app/layout.tsx` untouched): 1 error remained
(`LayoutProps<"/">`). After running `npm run build` once (which
generates `.next/types/`, required for that global type to resolve):
0 errors. This is a build-artifact dependency, not a code defect.

## Lint result

`npm run lint`: **PASS** (0 errors, 1 pre-existing warning)

The one warning — `components/map/incident-map.tsx:174`, "Unused
eslint-disable directive" — is unrelated to M14-H's scope (MapLibre,
listed as architecture not to touch) and matches the M14-G baseline
exactly. Not modified.

## Build result

`npm run build`: **PASS**

`next build` (Turbopack) compiled successfully and generated all 12
routes (`/`, `/dashboard`, `/report`, `/ask`, `/incidents/[id]`, and
7 API routes) with no errors. Required placeholder env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) in a local `.env.local`
for the build to complete without live credentials — no live
Supabase/Gemini calls were made; this is a static/type-check build
only. `.env.local` and the `.next/` build output were removed after
verification and are not part of this handoff's file changes.

## Tests actually executed

All run live via `npx tsx`, in this environment (network + deps
available):

| Test file | Result |
|---|---|
| `lib/incidents/intelligence-client.test.ts` | **PASS** — 28/28 |
| `lib/incidents/intelligence-generation.test.ts` | **PASS** — 41/41 |
| `lib/incidents/intelligence-api.test.ts` | **PASS** — 49/49 |
| `lib/incidents/intelligence-context.test.ts` (edited file, re-run for confirmation, not in the module prompt's required list) | **PASS** — 26/26 |

Browser/E2E testing: **NOT RUN** (excluded by module prompt).
Live Gemini/Supabase testing: **NOT RUN** (excluded by module prompt).

---

## Remaining limitations

- The build required placeholder (non-functional) env values to
  complete `next build`'s static generation step; no live
  Supabase/Gemini behavior was exercised, consistent with the module
  prompt's exclusion of live-credential testing.
- `npm audit` reports 1 critical severity vulnerability in the
  installed dependency tree (pre-existing, from `package-lock.json`,
  not introduced by this module). Not investigated or fixed —
  "do not add dependencies" / "do not modify architecture" put dependency
  remediation out of scope for M14-H; flagged for M14-I or a
  dedicated follow-up to triage.
- No other known TypeScript, lint, or test issues remain from this
  pass's scope.

---

## Files changed

**Modified:**
- `lib/incidents/intelligence-context.test.ts` — two `report_text: null`
  → `report_text: ""` fixture fixes (lines 35, 111).
- `CURRENT_STATE.md` — appended an "M14-H2" section in the same style
  prior M14 sub-parts used.

**Created:**
- `HANDOFF_M14H.md` (this file)

**Not modified:**
```
app/layout.tsx
app/api/incidents/[id]/intelligence/route.ts
lib/incidents/intelligence-api.ts
lib/incidents/intelligence-generation.ts
lib/incidents/intelligence-evidence.ts
lib/incidents/intelligence-context.ts
lib/incidents/intelligence-client.ts
lib/incidents/intelligence-types.ts
lib/incidents/intelligence-category.ts
lib/scoring/priority.ts
lib/rate-limit.ts
lib/rag/*, lib/ai/*
components/incidents/incident-intelligence.tsx
components/map/incident-map.tsx
supabase/migrations/*
package.json (no dependencies added)
(and every other file not listed above)
```

---

## Confirmation

M14-I was **not** started. No architecture area was touched (M12
RAG, M13, MapLibre, priority scoring, incident extraction, database
schema, persistence, authentication — all read-only or untouched). No
new dependency was added (`npm install` only installed the existing
`package-lock.json` tree). No new AI feature was added. No UI was
redesigned.
