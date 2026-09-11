# Module M06 Handoff

## Completed

Deterministic Priority Engine — a pure TypeScript module that turns M05's
`ExtractedIncident` into a reproducible 0–100 priority score, severity, and
a per-factor breakdown, plus a minimal `/report` UI integration to display
it after a successful analysis.

## Files created

- `lib/scoring/priority.ts` — `calculatePriority(incident)`,
  `severityForScore(score)`, and the `PriorityResult` / `PriorityFactor` /
  `Severity` types, plus the exported `LARGE_GROUP_THRESHOLD` and
  `MAX_RAW_SCORE` constants. No AI, database, network, React, or browser
  dependency — pure and deterministic.
- `lib/scoring/priority.test.ts` — focused, self-running assertion script
  (26 checks) covering all six required test cases plus defensive
  bounds checks. No test framework was installed, so this runs as a plain
  script rather than through a runner — see Tests below.

## Files modified

- `app/report/page.tsx` — added a `priorityResult` state slot; after a
  successful `POST /api/analyze`, calls `calculatePriority()` client-side
  and renders a severity-colored priority badge plus a list of triggered
  factors in the existing result card. No new route, no persistence, no
  redesign — M05's flow and states (`analyzing`, `analysisResult`,
  `analysisError`) are unchanged.

## Dependencies

None added or changed.

## Environment variables

None changed.

## Database changes

None.

## Scoring rules

| Factor | Condition | Points |
|---|---|---:|
| Immediate danger | `immediateDanger === true` | +25 |
| Children present | `childrenCount > 0` | +20 |
| Medical emergency | `medicalEmergency === true` | +20 |
| Mobility impairment | `mobilityImpairment === true` | +15 |
| Elderly present | `elderlyCount > 0` | +10 |
| Large group | `peopleAffected >= 10` | +10 |
| Food shortage | `foodShortage === true` | +5 |

Maximum raw score: **105** (`MAX_RAW_SCORE`).

## Normalization

```text
normalizedScore = round((rawScore / 105) * 100)
```

Result is clamped to `0–100` as a defensive guard (`score` in
`PriorityResult`). `rawScore` (pre-normalization) is also exposed.

## Large group

```text
peopleAffected >= 10   (LARGE_GROUP_THRESHOLD, exported constant)
```

Documented in `lib/scoring/priority.ts` next to the constant, since the
PRD specifies the factor but not its numeric cutoff.

## Severity

```text
80–100   CRITICAL
60–79    HIGH
40–59    MODERATE
0–39     LOW
```

Implemented in `severityForScore()`, boundary-tested explicitly.

## Tests

Run with:

```bash
npx tsx lib/scoring/priority.test.ts
```

Result: **26 passed, 0 failed.**

Covers: no factors (rawScore 0 / LOW), immediate-danger-only, children +
medical, large-group threshold (9 vs 10), all factors triggered (105 raw →
100 / CRITICAL), severity boundaries at 39/40/59/60/79/80/100, and defensive
checks that score is never `NaN`, `Infinity`, or outside `0–100`.

**Note on Test 3:** the M06 module prompt's own worked example for the
"children + medical" case (`childrenCount=2`, `medicalEmergency=true`,
rawScore 40) states the expected severity is `MODERATE`. Applying the
prompt's own formula and its own boundary table exactly as written:
`round(40/105*100) = 38`, and `38` falls in `0–39 → LOW` per the same
prompt's boundary table. That worked example is internally inconsistent
with its own formula/table. `lib/scoring/priority.ts` implements the
formula and boundary table exactly as specified (which is unambiguous and
was cross-checked independently); the test asserts the value the formula
actually produces (`severityForScore(38) = LOW`) rather than the
inconsistent example, and documents this in a comment. No factor
point value, threshold, or boundary was changed to make this "pass" — the
formula is followed literally.

## Known issues

- The children+medical worked example in the module prompt doesn't match
  its own formula/table, as documented above. No engine behavior was
  changed to resolve it; if a different intended formula or point table
  was meant, that should be clarified before M07 persists scores derived
  from this engine.
- No test framework (Jest/Vitest) is installed yet, so `lib/scoring/priority.test.ts`
  is a self-running script, not wired to `npm test`. Adding a real runner
  was avoided per this module's "don't add dependencies" constraint; a
  future module can add one and drop this file's assertions almost
  unchanged into `describe`/`it` blocks.

## Next module

M07 — Persistence + API Integration

## Important notes for next Claude

- Call `calculatePriority(extractedIncident)` from
  `lib/scoring/priority.ts` after M05's extraction succeeds, server-side,
  and persist `rawScore`, `score`, `severity`, and (optionally) the
  `factors` breakdown alongside the incident row — the `incidents` table
  in `ARCHITECTURE.md` already has `priority_score` and `severity` columns
  reserved for this.
- Keep the score/severity computation happening only in this module (or
  code that calls it) — never let Gemini or any AI call assign
  `priority_score`/`severity` directly.
- `lib/scoring/priority.ts` has no side effects and no dependencies, so it
  is safe to call from a Route Handler (e.g. inside `/api/incidents` when
  M07 creates it) as well as from client code as `/report` does now — no
  need to duplicate the logic.
- `app/report/page.tsx`'s client-side `calculatePriority()` call is a
  temporary, no-persistence preview for the reporter. Once M07 adds real
  persistence via the API, consider whether the authoritative score should
  come back from the server response instead of being recomputed
  client-side, to avoid two sources of truth — but that's an M07 decision,
  not required by M06.
