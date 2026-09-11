# Module M08 Handoff

## Module completed

M08 — Coordinator Dashboard

## Files created

- `app/dashboard/page.tsx` — the coordinator command-center page.
- `HANDOFF_M08.md` — this file.

## Files modified

- `app/api/incidents/route.ts` — added `GET /api/incidents` in the same
  file as the existing `POST` handler (no new route file, per the module
  prompt). `POST` behavior is completely unchanged.
- `CURRENT_STATE.md`.

## Dependencies

None added, none removed. No `package.json` changes.

## API

### `GET /api/incidents`

Server-side read path used exclusively by `/dashboard`. Uses
`createServiceClient()` — the browser never queries Supabase directly.

Query parameters (all optional):

| Param | Values | Behavior if invalid/unknown |
|---|---|---|
| `severity` | `LOW`, `MODERATE`, `HIGH`, `CRITICAL` | ignored (no filter applied) |
| `status` | `NEW`, `VERIFIED`, `RESOLVED` | ignored |
| `incidentType` | any of the 10 `incident_type` enum values | ignored |
| `limit` | positive integer, capped at 200 | falls back to default `100` |

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "incidentType": "flood",
      "summary": "...",
      "language": "Urdu",
      "latitude": 34.1,
      "longitude": 71.9,
      "peopleAffected": 4,
      "childrenCount": 2,
      "elderlyCount": 0,
      "medicalEmergency": false,
      "mobilityImpairment": false,
      "immediateDanger": true,
      "foodShortage": false,
      "waterRisk": true,
      "priorityScore": 76,
      "severity": "HIGH",
      "status": "NEW",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

Sorted `created_at desc` (newest first) at the database level — the
dashboard does not re-sort. Selected columns exclude `embedding`,
`report_text`, `normalized_text`, and `confidence` (not needed by the UI;
`embedding` in particular should never leave the server).

Error responses:

- `503` — Supabase service-role configuration missing:
  `{"success": false, "error": "Incident data is currently unavailable."}`
- `500` — query failed at the database level:
  `{"success": false, "error": "Unable to load incidents."}`

Neither ever includes a raw Postgres error, stack trace, or credential.
Diagnostic detail is logged server-side only, gated on
`NODE_ENV === "development"`.

### `POST /api/incidents` (unchanged)

Untouched. Still the M07 pipeline: validate → extract → score → persist.

## Dashboard

Route: `app/dashboard/page.tsx` (client component).

- **Metrics**: Critical / High / Moderate / Total, computed by counting
  the fetched list's persisted `severity` field
  (`incidents.filter(i => i.severity === "CRITICAL").length`, etc.) — no
  second scoring system, no recomputation.
- **Incident feed**: severity badge (shows persisted `priorityScore` +
  `severity` together), human-readable incident type label (display-only
  mapping; the persisted enum value itself is never mutated), summary,
  people-affected count, a compact set of indicator badges (immediate
  danger, children present, elderly present, medical emergency, mobility
  impairment — only shown when true, so quiet incidents don't clutter the
  feed), a relative timestamp (hand-rolled `formatRelativeTime`, no new
  date dependency), and "Location provided" text when `latitude`/
  `longitude` are non-null (no map rendering — explicitly out of scope,
  belongs to M10). Each card is a `<Link>` to `/incidents/[id]`; that
  route does not exist yet (M09), so it will currently 404 — this is
  expected and was called out as acceptable by the module prompt.
- **Filters**: severity / incident type / status, each a native `<Select>`
  bound to `"ALL"` or the real enum value. Applied client-side over the
  already-fetched list, combined with AND semantics (all three narrow the
  same list together).
- **Sorting**: newest-first, inherited from the API's `created_at desc`
  ordering; no separate "prioritize urgent" control was added — filtering
  by severity already covers that need without extra UI complexity, per
  the module prompt's "do not over-engineer" guidance.
- **Refresh**: a button that re-calls `GET /api/incidents`. No polling, no
  WebSockets, no Supabase Realtime.
- **Loading state**: `role="status"`, "Loading incidents…", shown on
  initial load and on refresh.
- **Error state**: `role="alert"`, shows the API's controlled error
  message only (never a raw error).
- **Empty state**: exact copy from the module prompt — "No incidents
  reported yet." / "New emergency reports will appear here." — shown only
  when the fetch succeeded and returned zero incidents (distinct from the
  "0 incidents match your filters" message, which is separate and only
  appears when filters are active).

## Data source

The dashboard never imports `lib/supabase/client.ts` or any Supabase
client directly. It only calls `fetch("/api/incidents")`. All Supabase
access happens inside the Route Handler, server-side, via
`createServiceClient()`.

## Priority authority

`priorityScore` and `severity` displayed on the dashboard are exactly the
values returned by `GET /api/incidents`, which are read directly from the
`incidents` table (columns written once, at creation time, by M07's
`POST /api/incidents` pipeline). The dashboard performs no priority or
severity calculation of any kind — `lib/scoring/priority.ts` is not
imported anywhere in `app/dashboard/page.tsx`.

## Validation

- `npm install` — succeeded (418 packages, no new packages added by this
  module; this was just ensuring a clean `node_modules` in this session).
- `npm run lint` — passed, zero errors/warnings. (One `react-hooks/set-
  state-in-effect` error was hit and fixed by deferring the initial fetch
  call with `queueMicrotask` inside the effect body, rather than calling
  the async function directly — this does not change when data loads in
  practice, just satisfies the lint rule about not calling `setState`
  synchronously inside the effect body itself.)
- `npm run build` — succeeded with all four env vars unset. Routes:
  `/`, `/report`, `/dashboard` static; `/api/analyze`, `/api/incidents`
  dynamic.
- `npx tsx lib/scoring/priority.test.ts` — 26 passed, 0 failed (M06
  untouched).
- Manual `next dev` checks (all env vars unset):
  - `GET /dashboard` → `200` (renders the controlled error state, since
    `GET /api/incidents` returns `503` without Supabase config).
  - `GET /api/incidents` → `503`,
    `{"success":false,"error":"Incident data is currently unavailable."}`.
  - `GET /api/incidents?severity=CRITICAL&limit=5` → same controlled
    `503` (fails before query params matter, since Supabase isn't
    configured) — confirms no crash from param parsing either.
  - `GET /report` → `200` (regression, unchanged from M07).
  - `POST /api/incidents` with `{"bad":"data"}` → `400` (regression,
    unchanged).
  - `POST /api/incidents` with a fully valid body → `503`
    "AI analysis is currently unavailable." (regression, unchanged — fails
    at the extraction step before reaching Supabase, same as M07).

## Live testing

**Not performed.** No `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
/ `GEMINI_API_KEY` were available in this environment (same constraint
noted in every handoff since M02/M07). The `GET` query was written
directly against the actual M02 migration's column names (verified by
reading the migration file), and the response mapping matches the
existing `POST` response's camelCase convention exactly. The next session
with real credentials should: apply the M02 migration if not already
applied, submit one or two reports through `/report`, then load
`/dashboard` and confirm the metrics, feed, and filters all reflect the
real rows (and that severity colors/counts line up with what was
persisted).

## Known issues

- `/incidents/[id]` does not exist yet, so clicking any incident card
  currently 404s. This is expected per the module prompt ("If the route
  does not exist yet, the dashboard can still generate the correct link
  for M09") and is not a defect of M08.
- The dashboard fetches at most 100 incidents (API default) and filters
  client-side over that page only — with more than 100 persisted
  incidents, filters will only ever surface matches within the most
  recent 100, not the full table. Acceptable for the MVP/demo scale
  described in the PRD (~50 incidents); a future module could move
  filtering server-side or add pagination if the demo dataset grows past
  that.
- No live-data round trip has been verified (see above) — verify this
  before relying on the dashboard for the actual demo.

## Next module

M09 — Incident Detail

## Important notes for next Claude

- Build `app/incidents/[id]/page.tsx` and a corresponding
  `GET /api/incidents/[id]` Route Handler (not yet implemented — M08 only
  added the list endpoint). It should return the single incident row plus
  its joined `incident_needs` rows.
- Continue the same authority rule: `priority_score`/`severity` (and now
  also the individual `incident_needs` rows) are read directly from
  persisted data, never recomputed in the detail view.
- The dashboard already links to `/incidents/[id]` using the incident's
  real `id` (a Postgres UUID from the `incidents` table) — no change
  needed there once the route exists.
- Consider excluding `embedding` from the single-incident select for the
  same reason it's excluded from the list endpoint (internal-only,
  large, not needed by any UI built so far).
- Status updates (`NEW` → `VERIFIED` → `RESOLVED`) are FR-16 and were
  explicitly out of scope for M08 (dashboard only *displays* status); the
  incident detail view is the natural place for the coordinator status
  control described in the PRD's `/incidents/[id]` screen spec, but check
  whether that's assigned to M09 or a later module before adding it.
