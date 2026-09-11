# Module M07 Handoff

## Completed

Persistence + API Integration — `/report` now submits through a new,
authoritative `POST /api/incidents` endpoint that runs the full pipeline
(validate → Gemini extraction → deterministic priority → Supabase insert)
and returns the persisted incident.

## Files created

- `app/api/incidents/route.ts` — `POST /api/incidents`.
- `lib/validation/report-request.ts` — shared request-body validator used
  by both `/api/analyze` and `/api/incidents` (extracted from M05's
  previously-inline validator to avoid drift between the two routes).

## Files modified

- `app/api/analyze/route.ts` — refactored to import `parseReportRequest`
  from the new shared module instead of its own inline copy. Behavior is
  unchanged except that latitude/longitude range validation (-90..90 /
  -180..180) is now enforced server-side here too — a gap in M05's
  original inline validator (it only checked type, not range), closed as
  part of writing the shared validator for M07's stricter request spec.
  `/api/analyze` remains a working, analysis-only endpoint.
- `app/report/page.tsx` — submit now calls `POST /api/incidents` instead
  of `POST /api/analyze`. The M06 client-side `calculatePriority()` call
  and its import were removed; the result card now renders the
  **server-returned** `priorityScore`/`severity`/`summary`/`needs` from
  the persisted incident. Form fields, validation, and layout are
  otherwise unchanged from M04.
- `CURRENT_STATE.md`.

## Dependencies

None added or changed.

## Environment variables

No new variables introduced. The four already in `.env.example` are now
all load-bearing for `/api/incidents`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

(No values included here or anywhere in this handoff/ZIP.)

## Database changes

**None.** The existing M02 migration
(`supabase/migrations/00000000000001_initial_schema.sql`) and its
`incidents` / `incident_needs` tables, `incident_type` /
`incident_severity` / `incident_status` enums are used exactly as
defined — no new tables, columns, or enum values.

**Important:** M02's handoff noted the migration had not yet been applied
to a live Supabase project, and that is still true in this environment. **The
M02 migration must be applied to the target Supabase project before
`/api/incidents` can persist real incidents.**

## API

### `POST /api/incidents`

Request body — same shape as `/api/analyze` (see `parseReportRequest` in
`lib/validation/report-request.ts`):

```ts
{
  reportText: string;              // 10-10,000 chars after trim
  latitude: number | null;         // -90..90 if provided
  longitude: number | null;        // -180..180 if provided
  peopleAffected: number | null;   // non-negative integer if provided
  childrenCount: number | null;
  elderlyCount: number | null;
  language: "auto" | "en" | "ur" | "ur-roman";
  immediateDanger: boolean;
  medicalEmergency: boolean;
  mobilityImpairment: boolean;
  foodShortage: boolean;
  waterRisk: boolean;
  needs: string[];
}
```

**Note on counts:** the module prompt's illustrative request shape showed
`peopleAffected`/`childrenCount`/`elderlyCount` as required numbers. This
implementation keeps them nullable instead, matching the existing, working
M04 form (which leaves them blank when unspecified) and M05's
`IncidentExtractionInput`/reconciliation contract, which treats `null` as
"the reporter did not state this" rather than "zero." Forcing them
required at the HTTP boundary would have meant either breaking the M04
form or silently converting "unspecified" to `0` before it reaches
reconciliation — both worse than keeping the existing, already-validated
contract. This is a deliberate, documented deviation from the prompt's
sketch, not an oversight.

Responses:

- `201` — created:
  ```json
  {
    "success": true,
    "data": {
      "id": "...",
      "incidentType": "flood",
      "language": "Urdu",
      "summary": "...",
      "priorityScore": 76,
      "severity": "HIGH",
      "status": "NEW",
      "needs": ["water", "shelter"],
      "createdAt": "..."
    }
  }
  ```
- `400` — malformed/invalid request body.
- `503` — `GEMINI_API_KEY` unset, or Supabase service-role configuration
  missing/invalid (persistence unavailable).
- `502` — Gemini timeout, invalid AI output, or provider error.
- `500` — the incident insert or the needs insert failed at the database
  level.

No raw provider/database errors, stack traces, or credentials are ever
included in a response.

### `POST /api/analyze` (unchanged contract, refactored internals)

Still available as an analysis-only endpoint (no persistence). Response
shape and status codes are unchanged from M05.

## Processing pipeline

```text
POST /api/incidents
  → parseReportRequest(body)            [lib/validation/report-request.ts]
  → extractIncident(input)              [lib/ai/incident-extraction.ts, M05]
  → calculatePriority(extracted)        [lib/scoring/priority.ts, M06]
  → createServiceClient().from("incidents").insert(...).select().single()
  → createServiceClient().from("incident_needs").insert([...])
  → 201 response (or a controlled error at any step)
```

`incidents` column mapping:

| Column | Source |
|---|---|
| `report_text` | `input.reportText` (as submitted) |
| `normalized_text` | `input.reportText` (already trimmed by the validator; no further normalization exists yet) |
| `language` | `extracted.language` |
| `incident_type` | `extracted.incidentType` |
| `summary` | `extracted.summary` |
| `latitude` / `longitude` | `input.latitude` / `input.longitude` — **reporter-submitted only; Gemini never supplies or overrides these** |
| `people_affected` / `children_count` / `elderly_count` | `extracted.*` (already reconciled with reporter input by M05) |
| `mobility_impairment` / `medical_emergency` / `immediate_danger` / `food_shortage` / `water_risk` | `extracted.*` (same) |
| `priority_score` | `priority.score` (M06, server-computed) |
| `severity` | `priority.severity` (M06, server-computed) |
| `confidence` | `null` — `ExtractedIncident` (M05) has no confidence field; none was invented, per the module prompt's instruction not to expand the extraction schema just for this column |
| `status` | `"NEW"` |
| `embedding` | left untouched (column not written; stays `null` via table default) |

`incident_needs`: one row per `extracted.needs[]` entry, `need_type` = the
need string, `priority` derived deterministically from extraction order
(`needs.length - index`, so the first extracted need gets the highest
number) rather than asking Gemini for another score.

## Security

- `createServiceClient()` (service-role Supabase client, bypasses RLS) is
  only ever called inside `app/api/incidents/route.ts`, a server-only
  Route Handler. It is never imported into a client component.
- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are read only in
  `lib/ai/incident-extraction.ts` and `lib/supabase/config.ts`
  respectively — both server-only modules — and never appear in any
  response body or client bundle.
- Priority/severity are calculated exclusively server-side from
  `calculatePriority(extracted)`. The request shape accepted by
  `parseReportRequest` has no score/severity field at all, so there is no
  way for a client to submit one, let alone have it persisted.
- Confirmed by code review: `app/report/page.tsx` (client component)
  imports only the `IncidentSeverity`/`IncidentType` **types** from
  `lib/supabase/types.ts`, never `lib/supabase/server.ts` or
  `lib/ai/incident-extraction.ts`.

## Validation

- `npm run lint` — passed, no errors or warnings.
- `npm run build` — succeeded with all four env vars (`GEMINI_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) unset, confirming the build never
  requires live credentials. Routes: `/`, `/report` static;
  `/api/analyze`, `/api/incidents` dynamic.
- `npx tsx lib/scoring/priority.test.ts` — re-run after this module's
  changes: still 26 passed, 0 failed (M06 untouched).
- Manual `next dev` checks (all env vars unset):
  - `GET /report` → `200`.
  - `POST /api/analyze` with a valid body → `503`
    "AI analysis is currently unavailable." (still works correctly).
  - `POST /api/incidents` with `{"bad":"data"}` → `400`.
  - `POST /api/incidents` with `latitude: 200` (out of range) → `400`.
  - `POST /api/incidents` with `peopleAffected: -1` → `400`.
  - `POST /api/incidents` with a fully valid body → `503`
    "AI analysis is currently unavailable." (fails at the extraction step,
    before the Supabase step is reached — no crash, no stack trace).

## Live testing

**Not performed.** No `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
or `GEMINI_API_KEY` were available in this environment, so a real
`POST /api/incidents` → `201` → row-exists-in-Postgres round trip was not
possible. The insert/mapping code was written directly against the actual
M02 migration's column names, types, and enum values (verified by reading
the migration file, not assumed), and every failure path up to the
Supabase call was exercised manually as listed above. The next session
with real credentials should do one synthetic end-to-end check: submit
`/report`, confirm `201`, then confirm a matching row in `incidents` and
matching rows in `incident_needs`.

## Known issues

- Live Supabase persistence is unverified (see above) — verify with real
  credentials before relying on it for a demo.
- The M02 migration still needs to be applied to whatever Supabase
  project is actually used; nothing in M00-M07 has applied it.
- `normalized_text` is currently just the trimmed report text — no real
  normalization (e.g. whitespace collapsing, transliteration) exists yet.
  Left as-is since no module has specified normalization rules.
- Needs priority is a simple order-derived integer, not a
  meaningfully-calibrated scale — acceptable for MVP per the module
  prompt ("keep this simple").

## Next module

M08 — Coordinator Dashboard

## Important notes for next Claude

- Read incidents through a server-side/API read path — do not add
  client-side Supabase queries with the anon key that bypass a proper
  contract. A `GET /api/incidents` (list) and/or `GET /api/incidents/[id]`
  (detail) Route Handler, using `createServiceClient()` or the
  session-aware `createClient()` from `lib/supabase/server.ts` as
  appropriate, is the natural next piece — M07 only implemented `POST`.
- `priority_score`/`severity` are already persisted and authoritative;
  the dashboard should read and display them directly rather than
  recomputing anything client-side.
- `incident_needs` rows are already persisted per incident; join or
  query them for the incident detail view.
- Do not modify the M02 migration unless a genuine, previously-undiscovered
  schema gap is found — none was found in M07.
- Remember to actually apply the M02 migration to a real Supabase project
  before demoing any dashboard against live data.
