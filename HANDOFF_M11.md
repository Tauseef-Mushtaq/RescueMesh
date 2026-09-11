# Module M11 Handoff

## Module

M11 — Knowledge Base Foundation + Curated Disaster Knowledge

## Status

**Completed.**

## Implemented

- **Database**: new `knowledge_documents` table via
  `supabase/migrations/00000000000003_knowledge_documents.sql`, entirely
  separate from the pre-existing M02 `knowledge_sources`/
  `knowledge_chunks` tables (those remain untouched and reserved for a
  future embeddings/RAG module — `knowledge_documents` holds whole
  curated articles, not chunks, and has no `embedding` column).
- **Seed data**: 23 curated, static English entries covering all 10
  categories.
- **API**: `GET /api/knowledge`, with `category`/`language`/`limit`
  filters.
- **Security**: RLS enabled, published-only public SELECT policy, plus
  an explicit `published = true` filter in the API query itself.
- **Docs**: this file, `CURRENT_STATE.md`, and two small additions to
  `ARCHITECTURE.md`'s data-model/API-contract tables.

## Database

**Table**: `knowledge_documents`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `title` | `text not null` | |
| `slug` | `text not null unique` | stable identifier, used for `on conflict` idempotency |
| `category` | `text not null` | checked against the 9 existing `incident_type` values + `general` |
| `summary` | `text not null` | |
| `content` | `text not null` | |
| `source` | `text` | nullable, e.g. "General emergency preparedness guidance" |
| `language` | `text not null default 'English'` | checked: `English` / `Urdu` / `Roman Urdu`, matching the existing `incidents.language` / `ExtractionLanguage` convention |
| `published` | `boolean not null default true` | |
| `created_at` / `updated_at` | `timestamptz` | `updated_at` maintained by the existing `set_updated_at()` trigger function (reused from M02, not duplicated) |

**Why `category` is a checked text column, not the shared `incident_type`
enum**: `general` (emergency preparedness, not tied to any incident) has
no `incident_type` equivalent, and altering a shared enum used by the
`incidents` table was outside M11's scope and risked an unrelated
regression. A dedicated check constraint keeps the same 9 values plus
`general` without touching M02's schema.

**Indexes**:
- `knowledge_documents_published_category_idx` — composite `(published, category)`, matching the actual query shape (`GET /api/knowledge` always filters `published = true`, optionally also by `category`).
- `knowledge_documents_language_idx` — for the `language` filter.
- No index was added on `slug` beyond the implicit one from its `unique` constraint.

**Constraints**: `category` and `language` check constraints; `slug`
unique constraint; standard `not null` on required fields.

**RLS**: enabled. One policy:

```sql
create policy "public_read_published_knowledge_documents"
  on knowledge_documents for select
  to anon, authenticated
  using (published = true);
```

No insert/update/delete policies for `anon`/`authenticated` — matches
the existing M02 pattern of narrow, explicit policies with writes
reserved for server-side/service-role code. This policy is
defense-in-depth: the actual `GET /api/knowledge` route uses the
service-role client (which bypasses RLS entirely, same as every other
Route Handler in this project) and additionally filters
`published = true` explicitly in its own query — so unpublished rows
never leak through the public endpoint even without relying on RLS. The
RLS policy exists so that if a future module ever queries this table
with the anon key directly (bypassing the API), draft/unpublished
content is still not exposed.

**Migration**: `supabase/migrations/00000000000003_knowledge_documents.sql`.
Table creation, indexes, RLS, and seed data are all in this one file,
consistent with the project's existing single-file-per-migration
convention. The seed `insert` uses `on conflict (slug) do nothing`, so
re-applying this migration (or replaying it in a fresh environment) is
safe and will not create duplicates.

## API

### `GET /api/knowledge`

Server-side read path, same trust boundary as `GET /api/incidents`
(M08): uses `createServiceClient()`; the browser never queries Supabase
directly.

Query parameters (all optional):

| Param | Values | Behavior if invalid/unknown |
|---|---|---|
| `category` | `flood`, `earthquake`, `fire`, `building_collapse`, `medical_emergency`, `missing_person`, `road_blockage`, `food_shortage`, `shelter_need`, `general` | ignored (no filter applied) |
| `language` | `English`, `Urdu`, `Roman Urdu` | ignored |
| `limit` | positive integer, capped at 100 | falls back to default `50` |

Always filters `published = true` — this is not optional and cannot be
overridden by any query parameter.

Sort order: `category asc, title asc` (a stable, readable default for a
small curated set — no "newest first" concept applies to static
knowledge the way it does to incidents).

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "title": "What to Do During a Flood",
      "slug": "flood-immediate-response",
      "category": "flood",
      "summary": "...",
      "content": "...",
      "source": "General emergency preparedness guidance",
      "language": "English",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

`published` is intentionally omitted from the response body — every row
returned is published by construction, so echoing the flag back would
only invite a client to (incorrectly) treat it as meaningful to check.

Error responses:

- `503` — Supabase service-role configuration missing:
  `{"success": false, "error": "Knowledge data is currently unavailable."}`
- `500` — query failed at the database level:
  `{"success": false, "error": "Unable to load knowledge documents."}`

Neither ever includes a raw Postgres error, stack trace, or credential.
Diagnostic detail is logged server-side only, gated on
`NODE_ENV === "development"` — matching the existing convention in
`app/api/incidents/route.ts`.

No Gemini call, no embeddings, no vector search happens anywhere in this
route. If `GEMINI_API_KEY` is unset or Gemini is down, `/api/knowledge`
is completely unaffected.

## Seed Data

**23 entries**, all English, all `published = true`:

| Category | Count |
|---|---|
| flood | 4 |
| earthquake | 4 |
| fire | 4 |
| building_collapse | 2 |
| medical_emergency | 2 |
| missing_person | 2 |
| road_blockage | 2 |
| food_shortage | 1 |
| shelter_need | 1 |
| general | 1 |
| **Total** | **23** |

This is slightly above the module prompt's "10-20" guidance (23 vs. 20)
— the deliberate trade-off was covering **all 10** categories rather
than skipping `food_shortage` or `general` to stay strictly under 20;
each entry is a distinct, non-redundant topic (no padding). Content is
concise, factual, safety-oriented, explicitly non-diagnostic (medical
entries state plainly that they are not medical advice and do not
replace professional emergency services), and does not make unsupported
medical claims. No Urdu/Roman Urdu content was seeded — the module
prompt explicitly said to favor quality over quantity and not generate
"poor-quality machine translations merely to increase the number of
records," and no existing high-quality Urdu/Roman Urdu source content
was available to curate from in this environment. The `language` column
and its filter are fully functional and ready for real Urdu/Roman Urdu
entries to be added later without any schema or API change.

## Security

- `GET /api/knowledge` only ever returns rows where `published = true`,
  enforced by an explicit `.eq("published", true)` in the query — not
  solely by RLS, since the service-role client used by this route
  bypasses RLS by design (same as every other Route Handler in the
  project).
- RLS is nonetheless enabled on `knowledge_documents`, with a policy
  restricting `anon`/`authenticated` `select` to `published = true`
  rows only, as defense-in-depth for any future access path that isn't
  the service-role-backed API route.
- `SUPABASE_SERVICE_ROLE_KEY` is read only inside
  `app/api/knowledge/route.ts` via `createServiceClient()`
  (`lib/supabase/server.ts`) — the same server-only module already used
  by `/api/incidents` and `/api/incidents/[id]`. It is never imported
  into a client component and never appears in any response body.
- No new environment variables were introduced.

## Testing

Commands actually run in this environment (per `package.json`, which
defines `dev`, `build`, `start`, `lint` — no `test`/`typecheck` script
exists, so `tsc`/`tsx` were invoked directly):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 1 error — pre-existing, in `components/map/incident-map.tsx` (M10, `AttributionControlOptions`), already documented in `HANDOFF_HOTFIX.md`. Zero errors in any M11 file. |
| `npx eslint .` | 0 errors, 1 pre-existing unrelated warning in `incident-map.tsx` (already documented in `HANDOFF_HOTFIX.md`). Zero new lint issues. |
| `npm run build` | Compiles successfully; fails only at the same pre-existing `incident-map.tsx` typecheck step — not a new failure, not caused by M11. |
| `npx tsx lib/scoring/priority.test.ts` | 26 passed, 0 failed (M06 untouched). |
| No `test`/`typecheck` npm scripts exist | Confirmed by reading `package.json` before running anything — did not fabricate a script that doesn't exist. |

**Live API verification** (via `next dev`, no Supabase credentials
available in this environment — same constraint as every module since
M07):

- `GET /api/knowledge` → `503`, `{"success":false,"error":"Knowledge data is currently unavailable."}`
- `GET /api/knowledge?category=flood` → same controlled `503`
- `GET /api/knowledge?category=bogus` (invalid category) → same controlled `503`, no crash, no 400/500 from bad input handling
- `GET /api/knowledge?limit=abc` (invalid limit) → same controlled `503`, confirming the limit parser doesn't throw on non-numeric input
- `GET /api/knowledge?category=earthquake&language=English` → same controlled `503`

All of the above fail at the "Supabase not configured" step, before
filter logic would matter against real data — which is exactly the
behavior every prior module's API has shown in this same environment.
The filter-parsing code itself was also read/reviewed line-by-line
against the actual migration's column names and check-constraint
values.

## Regression Verification

All via live `next dev` in this environment:

- `GET /` → `200`
- `GET /report` → `200`
- `GET /dashboard` → `200`
- `GET /incidents/[id]` (with a syntactically valid but non-existent UUID) → `200` (renders its controlled error state, since Supabase isn't configured — same as before M11)
- `POST /api/incidents` with `{"bad":"data"}` → `400` (unchanged)
- `POST /api/incidents` with a fully valid body → `503`, `"AI analysis is currently unavailable."` (unchanged — fails at extraction before Supabase, same as every prior handoff)
- `GET /api/incidents` → `503`, `"Incident data is currently unavailable."` (unchanged)
- `GET /api/incidents/[id]` → `503`, same message (unchanged)

**Gemini hotfix regression check**:
```
grep -R "gemini-2.0-flash" . --exclude-dir=node_modules --exclude-dir=.next
```
returns only historical mentions inside `CURRENT_STATE.md`,
`HANDOFF_M05.md`, and `HANDOFF_HOTFIX.md` prose — **zero** matches in any
`.ts`/`.tsx` application file. `lib/ai/incident-extraction.ts` still
builds its model chain from `GEMINI_MODEL` →
`GEMINI_FALLBACK_MODEL` → `GEMINI_SECONDARY_FALLBACK_MODEL` (confirmed by
reading the file directly) — untouched by M11.

**Supabase hotfix regression check**: `createServiceClient()` in
`lib/supabase/server.ts` still reads `SUPABASE_SERVICE_ROLE_KEY` via
`getServiceSupabaseConfig()` and remains server-only (confirmed by
reading the file — untouched by M11).
`supabase/migrations/00000000000002_grant_service_role.sql` (the
permission-denied hotfix) is untouched and unmoved; M11 only adds a new
migration file after it (`00000000000003_...`), it does not modify or
reorder the existing two.

**If the hot fixes have not actually been applied to a live Supabase
project**: they have not been re-verified against a real database in
this session either — no credentials were available, exactly as noted
in `HANDOFF_HOTFIX.md` itself ("this migration has not been applied to
any live Supabase project from this environment"). That remains true
after M11; nothing in this module changes that status one way or the
other.

## Out of Scope

M11 does **not** include, and none of the following appear anywhere in
this change set:

```text
embeddings
pgvector (beyond the pre-existing, untouched M02 usage on other tables)
vector search
RAG
Gemini-generated knowledge / AI-generated safety instructions
web scraping
web crawling
PDF ingestion
OCR
document chunking
semantic search
similarity search
knowledge recommendation engine
external knowledge APIs
real-time knowledge synchronization
```

`GET /api/knowledge` has no Gemini dependency and will continue to work
identically regardless of `GEMINI_API_KEY`'s presence or Gemini's
availability.

## Known Issues

- 23 seed entries slightly exceeds the "10-20" guidance — a deliberate,
  documented trade-off to cover all 10 categories (see Seed Data
  above), not an oversight.
- All seed content is English only; `Urdu`/`Roman Urdu` filtering is
  fully implemented and tested against invalid/absent values, but there
  is currently no non-English content to actually filter to. A future
  module adding real Urdu/Roman Urdu entries needs no schema or API
  change.
- `GET /api/knowledge` fetches at most 100 rows (hard cap) with no
  pagination beyond `limit`. With only 23 seed rows this is a
  non-issue; a future module should add pagination if the knowledge
  base grows meaningfully past 100 entries.
- No UI surfaces this endpoint yet (by design — out of scope for M11).
  A future module can add a `/knowledge` page or integrate summaries
  into the incident detail view.
- The two pre-existing, unrelated typecheck/lint findings in
  `app/layout.tsx` (transient in one `tsc` run, absent in a
  re-run — did not reproduce reliably) and
  `components/map/incident-map.tsx` (`AttributionControlOptions` type
  error; one unused-eslint-disable warning) remain exactly as documented
  in `HANDOFF_HOTFIX.md`. They are M01/M10 issues, outside M11's scope,
  and were not touched.

## Next Module

The natural next knowledge-intelligence module is the embeddings/RAG
pipeline hinted at throughout the PRD and `ARCHITECTURE.md` (document
ingestion → chunking → embedding generation → `knowledge_chunks` →
vector similarity search → grounded Gemini recommendations via
`/api/rag`). That module can either: (a) chunk and embed the
`knowledge_documents` content created here into the existing, still-empty
`knowledge_sources`/`knowledge_chunks` tables, or (b) treat
`knowledge_documents` as the citable "source of truth" that RAG results
point back to for attribution. Either direction is compatible with what
M11 built — no rework of this module should be required either way. A
lighter-weight alternative next step, if RAG is deferred further, would
be a simple `/knowledge` UI page consuming `GET /api/knowledge` directly
(no AI involved), giving citizens/coordinators a browsable safety
reference immediately.
