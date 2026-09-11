# Module M09 Handoff

## Module completed

M09 — Incident Detail

## Files created

- `app/api/incidents/[id]/route.ts` — `GET /api/incidents/[id]`.
- `app/incidents/[id]/page.tsx` — the incident detail page.
- `HANDOFF_M09.md` — this file.

## Files modified

- `CURRENT_STATE.md`.

No other files were modified. `lib/supabase/types.ts` already contained
everything needed (`IncidentRow`, `IncidentNeedRow`) and did not require
changes.

## Dependencies

None added, none removed. No `package.json` changes.

## API

### `GET /api/incidents/[id]`

Server-side read path used exclusively by `/incidents/[id]`. Uses
`createServiceClient()` — the browser never queries Supabase directly.

Request: route param `id` (must look like a UUID).

Response (`200`):

```json
{
  "success": true,
  "data": {
    "id": "...",
    "reportText": "...",
    "normalizedText": "...",
    "language": "Urdu",
    "incidentType": "flood",
    "summary": "...",
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
    "confidence": null,
    "status": "NEW",
    "createdAt": "...",
    "updatedAt": "...",
    "needs": [
      { "id": "...", "needType": "water", "priority": 1 }
    ]
  }
}
```

`embedding` is never selected or returned.

Errors:

- `400` — route param is not a valid UUID:
  `{"success": false, "error": "Invalid incident ID."}`
- `404` — no incident with that ID exists:
  `{"success": false, "error": "Incident not found."}`
- `503` — Supabase service-role configuration missing:
  `{"success": false, "error": "Incident data is currently unavailable."}`
- `500` — the incident or needs query failed at the database level:
  `{"success": false, "error": "Unable to load incident."}`

None of these ever include a raw Postgres error, stack trace, or
credential. Diagnostic detail is logged server-side only, gated on
`NODE_ENV === "development"` (same convention as `GET /api/incidents`
from M08).

## UI

Route: `app/incidents/[id]/page.tsx` (client component).

- **Header**: back-to-dashboard link, incident type badge, severity
  badge, priority score, status badge, relative "Reported X ago" time.
- **Situation**: persisted `summary` and the verbatim `reportText` in a
  wrapped, readable container. Neither is modified or reinterpreted.
- **Affected People**: people/children/elderly counts. A `null` count
  renders as "Not provided" — never silently treated as zero. Also shows
  `language`.
- **Important Indicators**: the five persisted booleans (immediate
  danger, medical emergency, mobility impairment, food shortage, water
  risk). Only `true` values get an emphasized badge; `false` values are
  listed as plain "Not indicated" text so the page isn't cluttered with
  large false badges, while still making the negative state legible.
- **Needs**: persisted `incident_needs` rows, each showing a
  display-formatted need type (snake_case → readable label; already-
  readable strings pass through) and its persisted priority. No
  reordering beyond the order returned by the query; no recalculation.
- **Priority Explanation**: lists which M06 scoring factors are
  triggered, derived directly from the persisted incident fields using
  the exact M06 point table and the documented `LARGE_GROUP_THRESHOLD`
  constant (imported from `lib/scoring/priority.ts`, not reimplemented).
  Explicitly labeled as explanatory; the persisted `priorityScore` and
  `severity` are displayed elsewhere and are never overwritten.
- **Reported Location**: plain latitude/longitude text when both are
  present, otherwise "Location not provided." No map, no Leaflet, no new
  dependency — that's M10.
- **AI recommendation / Similar incidents**: omitted entirely, per the
  module prompt's "prefer omission over an unfinished-looking
  placeholder" guidance.
- **Loading state**: `role="status"`, "Loading incident…".
- **Not-found state**: distinct from the generic error state, shown only
  on a `404` response, with a back-to-dashboard link.
- **Error state**: `role="alert"`, shows the API's controlled error
  message only, with a back-to-dashboard link.
- No status-mutation control was added — FR-16 status transitions were
  flagged as possibly out of scope in the M08 handoff, and the M09
  module prompt explicitly says to stop and check before adding one; it
  was left for a later module.

Built entirely from existing M03 primitives (`Card`, `CardHeader`,
`CardTitle`, `CardContent`, `Badge`) and `PageShell` — zero new
dependencies (no charts, no date library, no map library).

## Data authority

`priorityScore` and `severity` are persisted authoritative values, read
directly from the `incidents` table and displayed as-is. `incident_needs`
rows are persisted authoritative values, read directly from the
`incident_needs` table and displayed as-is. The detail page's "Priority
Explanation" section derives triggered-factor labels from the persisted
incident fields using the M06 formula purely for display; it does not
call `calculatePriority()` to produce a new score, does not persist
anything, and does not replace the persisted `priorityScore`/`severity`
with a newly generated value.

## Security

- `createServiceClient()` is only called inside
  `app/api/incidents/[id]/route.ts`, a server-only Route Handler. The
  detail page never imports `lib/supabase/client.ts` or
  `lib/supabase/server.ts`.
- `embedding` is excluded from the Supabase `select()` for the single
  incident — it never leaves the server.
- All error responses are controlled and generic; no raw Postgres error,
  stack trace, environment variable, or credential is ever returned to
  the client. Diagnostics are `console.error`-logged server-side only in
  development.
- The route parameter is validated against a UUID pattern before it is
  used in any Supabase query.

## Validation

- `npm install` — succeeded (418 packages, no new packages).
- `npm run lint` — passed, zero errors/warnings.
- `npm run build` — succeeded with all four env vars unset. Routes:
  `/`, `/report`, `/dashboard` static; `/api/analyze`, `/api/incidents`,
  `/api/incidents/[id]`, `/incidents/[id]` dynamic.
- `npx tsx lib/scoring/priority.test.ts` — 26 passed, 0 failed (M06
  untouched).
- Manual `next dev` checks (all env vars unset):
  - `GET /` → `200` (regression).
  - `GET /report` → `200` (regression).
  - `GET /dashboard` → `200` (regression).
  - `GET /incidents/11111111-1111-1111-1111-111111111111` → `200`
    (renders the controlled error state, since the API returns `503`
    without Supabase config).
  - `GET /api/incidents/not-a-uuid` → `400`,
    `{"success":false,"error":"Invalid incident ID."}`.
  - `GET /api/incidents/11111111-1111-1111-1111-111111111111`
    (syntactically valid, unconfigured DB) → `503`,
    `{"success":false,"error":"Incident data is currently unavailable."}`.
  - `POST /api/incidents` with `{"bad":"data"}` → `400` (regression,
    unchanged).
  - `GET /api/incidents` → `503` (regression, unchanged).

The `404` path (syntactically valid UUID, configured Supabase, no
matching row) and the `500` path (query failure) were verified by code
review against the same query pattern used successfully in M08's
`GET /api/incidents`, but could not be exercised live without real
Supabase credentials — see Live testing below.

## Live testing

**Not performed.** No `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
/ `GEMINI_API_KEY` were available in this environment (same constraint
noted in every handoff since M02). The single-incident and
`incident_needs` queries were written directly against the actual M02
migration's column names (verified by reading the migration file). The
next session with real credentials should: apply the M02 migration if
not already applied, create or use a real incident through `/report`,
open `/dashboard`, click the incident, and confirm `/incidents/[id]`
loads with the incident type, summary, priority, severity, status,
people affected, indicators, needs, location, and original report all
exactly matching the persisted database values, and that `embedding` is
not present anywhere in the API response.

## Known issues

- The `404` and `500` paths of `GET /api/incidents/[id]` are unverified
  against a live database (see Live testing above) — verify before
  relying on them for a demo.
- No status-mutation control exists yet (`NEW` → `VERIFIED` →
  `RESOLVED` remains display-only), consistent with M08 and this
  module's own scope guidance; a future module should confirm where
  that control belongs.
- Live Supabase persistence for the whole detail flow is unverified —
  same standing limitation as every module since M02/M07/M08.

## Next module

M10 — Basic Disaster Map
