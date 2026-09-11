# Module M05 Handoff

## Completed

AI Incident Extraction — a server-side Gemini layer that turns an emergency
report (plus the reporter's own form inputs) into validated structured
incident data, wired up to the existing `/report` submit flow.

## Files created

- `lib/validation/incident-extraction.ts` — `ExtractedIncident` type, the
  incident-type/language enums, `SAFE_DEFAULT_EXTRACTION`, and
  `validateExtractedIncident()`, a dependency-free runtime validator.
- `lib/ai/incident-extraction.ts` — `extractIncident()`, the server-only
  Gemini extraction function. Builds the prompt, calls Gemini with a JSON
  response schema, validates the result, and reconciles it with
  reporter-provided values. Never throws.
- `app/api/analyze/route.ts` — `POST /api/analyze` route handler: request
  validation, calls `extractIncident`, returns controlled JSON responses.

## Files modified

- `app/report/page.tsx` — submit handler now `POST`s to `/api/analyze`
  instead of only logging locally; added `analyzing` / `analysisResult` /
  `analysisError` state and a result/error UI block. Form fields, layout,
  and validation logic from M04 are unchanged.

## Dependencies

- `@google/genai` (`^2.21.0`) — official Google Gemini SDK, used only in
  `lib/ai/incident-extraction.ts` (server-side).

## Environment variables

- `GEMINI_API_KEY` (already present in `.env.example` from M00) — now
  actually read, server-side only, in `lib/ai/incident-extraction.ts`. If
  unset, `/api/analyze` returns a controlled 503 with
  "AI analysis is currently unavailable." and the build/lint/dev server
  all continue to work without it.

## AI output schema

`ExtractedIncident`:

```text
incidentType: one of flood | earthquake | fire | building_collapse |
  medical_emergency | missing_person | road_blockage | food_shortage |
  shelter_need | other
language: English | Urdu | Roman Urdu
summary: string
peopleAffected, childrenCount, elderlyCount: non-negative integers
mobilityImpairment, medicalEmergency, immediateDanger, foodShortage,
  waterRisk: booleans
needs: string[]
riskFactors: string[]
```

Gemini is instructed (system instruction + JSON response schema) to extract
only what the report supports, use safe defaults for unknown fields, and
never calculate priority/severity or give emergency instructions.

After validation, `extractIncident` reconciles the AI's output with the
reporter's own form values: explicit counts overwrite AI guesses, explicit
"true" condition flags are OR'd in (never dropped), explicit `needs` are
merged in, and an explicit reporter-selected language overrides AI language
detection. This satisfies the "user-provided explicit values should not be
casually overwritten" requirement.

## API

`POST /api/analyze`

Request body (JSON): the same shape `/report` already builds —
`reportText`, `latitude`, `longitude`, `peopleAffected`, `childrenCount`,
`elderlyCount`, `language` (`auto`/`en`/`ur`/`ur-roman`), `immediateDanger`,
`medicalEmergency`, `mobilityImpairment`, `foodShortage`, `waterRisk`,
`needs: string[]`.

Responses:

- `200 { success: true, data: ExtractedIncident }`
- `400 { success: false, error }` — malformed/invalid request body
- `503 { success: false, error }` — `GEMINI_API_KEY` not configured
- `502 { success: false, error }` — Gemini timeout, invalid AI output, or
  provider error

No raw provider errors, stack traces, or configuration details are ever
returned to the client.

## Database changes

None.

## Validation

- `npm run lint` — passed, no errors or warnings.
- `npm run build` — succeeded with `GEMINI_API_KEY` (and all Supabase env
  vars) unset, confirming the build/lint path never requires live
  credentials. Routes: `/`, `/report` static; `/api/analyze` dynamic.
- Manual `validateExtractedIncident()` check via `tsx`: a well-formed object
  validates as `valid: true`; an object with a bad `incidentType` and a
  negative `peopleAffected` is rejected with both specific error messages.
- Manual `next dev` check:
  - `GET /report` → 200.
  - `POST /api/analyze` with a body missing required fields → `400` with a
    controlled error, no stack trace.
  - `POST /api/analyze` with a fully valid body and `GEMINI_API_KEY` unset
    → `503` with "AI analysis is currently unavailable.", no crash.
  - No real Gemini key was available in this environment, so a live
    successful-extraction call was not performed — see Known issues.
- Confirmed by code review: `app/report/page.tsx` (a client component) only
  imports the `ExtractedIncident` **type** from
  `lib/validation/incident-extraction.ts`; it does not import
  `lib/ai/incident-extraction.ts`, so `GEMINI_API_KEY` and the Gemini SDK
  never reach client-side code.
- Confirmed no `Supabase` client/insert calls were added anywhere in this
  module.

## Known issues

- The happy path (a real Gemini call returning a valid structured incident)
  was not exercised live, since no `GEMINI_API_KEY` was available in this
  environment. The request/response plumbing, schema, validator, and all
  failure paths were verified directly instead. The next session with a
  real key should do one manual end-to-end check on `/report`.
- Model name is hardcoded to `gemini-2.0-flash`; if that model is
  retired/renamed on the free tier, only `MODEL` in
  `lib/ai/incident-extraction.ts` needs to change.

## Next module

M06 — Priority Engine

## Important notes for next Claude

- `extractIncident()` in `lib/ai/incident-extraction.ts` returns an
  `ExtractedIncident` (see schema above) — build the deterministic
  priority/severity calculator as pure application code that consumes this
  object. Do not ask Gemini for a score.
- `POST /api/analyze` currently only returns the extraction result; it does
  not persist anything. M06 should stay focused on scoring logic (pure
  function over `ExtractedIncident` + factor table from the PRD) — wait for
  M07 to wire up persistence, unless your module prompt says otherwise.
- Reuse `INCIDENT_TYPES` and `EXTRACTION_LANGUAGES` from
  `lib/validation/incident-extraction.ts` rather than redefining them.
- Preserve the `/report` UI and the `/api/analyze` contract as-is unless a
  later module explicitly requires changing them.
