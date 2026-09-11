# Handoff — Gemini model retirement + Supabase permission hotfix

## 1. Root causes

- **Gemini failure:** `lib/ai/incident-extraction.ts` hard-coded
  `MODEL = 'gemini-2.0-flash'`, a model the provider has retired
  (404). The primary replacement, `gemini-3.8-flash`, can also
  return a transient `503 UNAVAILABLE` ("high demand"), which the
  old code had no fallback for.
- **Supabase permission failure:** the M02 migration enabled RLS and
  added `authenticated`-only SELECT policies, but never granted
  baseline table privileges to `service_role`. `permission denied for
  table incidents` is a Postgres GRANT-level error (not an RLS
  violation — RLS failures say "new row violates row-level security
  policy"). `service_role` bypasses RLS but still needs ordinary table
  privileges to reach the table at all.
- **15-second delay:** no code-level multiplied-retry bug was found.
  The delay matches the single existing `REQUEST_TIMEOUT_MS = 15000`
  constant in `incident-extraction.ts`. A 404 from a retired model
  should fail fast; ~15.4s is consistent with the request instead
  hanging until that timeout in whatever environment produced the
  original log. The new model-fallback chain shares one 15s budget
  across up to 3 attempts rather than 15s each, so it does not add to
  worst-case latency.

## 2. Files changed

- `lib/ai/incident-extraction.ts` — env-driven 3-model fallback chain
  (`GEMINI_MODEL` → `GEMINI_FALLBACK_MODEL` →
  `GEMINI_SECONDARY_FALLBACK_MODEL`), retryable-provider-error
  detection (503/UNAVAILABLE/high demand only), shared timeout budget,
  dev-only per-model failure logging. Public types/behavior unchanged.
- `supabase/migrations/00000000000002_grant_service_role.sql` — new
  migration granting `service_role` table/sequence privileges on
  `public` (see below). No application code needed changes for the
  Supabase side; `lib/supabase/config.ts`, `lib/supabase/server.ts`,
  and `app/api/incidents/route.ts` were inspected and are already
  correct (service-role key stays server-only, not logged, not
  exposed to the client) — left unchanged.
- `CURRENT_STATE.md`, `HANDOFF_HOTFIX.md` — documentation.

## 3. Database changes

- **Migration:** `supabase/migrations/00000000000002_grant_service_role.sql`
- **What it changes:** grants `USAGE` on schema `public`, and
  `SELECT/INSERT/UPDATE/DELETE` on all current tables (+ `USAGE/SELECT`
  on sequences) in `public` to `service_role`, plus matching
  `ALTER DEFAULT PRIVILEGES` so future tables in `public` are covered
  automatically.
- **Why it's safe:** scoped to `service_role` only — the trusted role
  already exclusively used by server-side route handlers behind the
  service-role key. Does not touch `anon` or `authenticated`, does not
  add any anonymous write policy, does not disable or weaken RLS.
  `service_role` bypassing RLS was already the intended design (see
  the M02 migration's own comments); this migration only restores the
  table-level access that bypass depends on.
- **Action required:** this migration has not been applied to any live
  Supabase project from this environment (no credentials available).
  Apply it via `supabase db push`, the Supabase SQL editor, or your
  normal migration pipeline before re-testing the `/report` flow.

## 4. Gemini behavior

```
Primary:   process.env.GEMINI_MODEL             (falls back to 'gemini-3.8-flash' if unset)
Fallback:  process.env.GEMINI_FALLBACK_MODEL     (falls back to 'gemini-3.7-flash' if unset)
Secondary: process.env.GEMINI_SECONDARY_FALLBACK_MODEL (falls back to 'gemini-3.6-flash' if unset)
```

Advances to the next model only on a retryable provider/availability
error (503 / "UNAVAILABLE" / "high demand" in the error). Any other
error (auth, bad request, network) or a shared-budget timeout stops
immediately and is reported through the existing `ExtractionResult` /
`ExtractionFailureReason` contract. Maximum 3 model attempts, one
shared 15s timeout budget across them.

## 5. Verification (actually run in this environment)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 2 errors, both pre-existing and unrelated (`app/layout.tsx` `LayoutProps`; `components/map/incident-map.tsx` `AttributionControlOptions`). No errors in changed files. |
| `npx eslint .` | 0 errors, 1 pre-existing unrelated warning in `incident-map.tsx`. |
| `npm run build` | Compiles successfully; fails only at the pre-existing `incident-map.tsx` typecheck step (same error as above). |
| Automated tests | No test runner is configured in `package.json` (no `test` script, no Jest/Vitest dependency); `lib/scoring/priority.test.ts` is a self-running assertion script per earlier handoffs, unrelated to this fix and untouched. |
| Live `/report` → Gemini → Supabase round trip | **Not run** — no `GEMINI_API_KEY` or real Supabase project credentials available in this environment. |
| `GET /api/incidents`, dashboard, incident detail, map | **Not run live** — same credential constraint; code paths were not modified by this fix and were not touched. |

## 6. Remaining issues / what to verify against a real project

1. Apply `00000000000002_grant_service_role.sql` to the actual
   Supabase project, then re-run a real `/report` submission and
   confirm the `incidents` + `incident_needs` INSERTs succeed.
2. Confirm with real credentials that `gemini-3.8-flash` is a valid
   model id for your Gemini API access; if it 404s the same way
   `gemini-2.0-flash` did, that's a provider-side model-availability
   issue, not something this fallback chain can fix (fallback only
   helps for *retryable* 503s, not for another retired/invalid model
   id — by design, per the "do not hide invalid-output bugs" and "do
   not fallback for malformed input" requirements).
3. Trigger an actual 503 from Gemini (or temporarily point
   `GEMINI_MODEL` at an invalid name) to observe the fallback chain
   advancing in dev logs.
4. `app/layout.tsx` and `components/map/incident-map.tsx` typecheck
   errors are pre-existing and out of scope for this hotfix (M01/M10
   respectively) — flagging for a separate fix.
