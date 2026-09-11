# Module M02 Handoff

## Completed

Supabase Foundation — client/server utilities, environment config validation, and the initial database migration covering the core RescueMesh data model. No application features implemented.

## Files created

- `lib/supabase/config.ts` — centralized env-var access/validation (public + service-role configs; `GEMINI_API_KEY` intentionally not validated here)
- `lib/supabase/client.ts` — browser-safe Supabase client (`@supabase/ssr` `createBrowserClient`)
- `lib/supabase/server.ts` — session-aware server client for Server Components/Route Handlers/Server Actions, plus a separate `createServiceClient()` for trusted server-only operations (bypasses RLS)
- `lib/supabase/types.ts` — small, hand-written row types for the M02 tables (not auto-generated)
- `supabase/migrations/00000000000001_initial_schema.sql` — initial schema (see Database section)

## Files modified

- `package.json` / `package-lock.json` — added Supabase dependencies
- `lib/supabase/.gitkeep` and `supabase/.gitkeep` removed (superseded by real content)

Preserved unchanged: `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `PROJECT_RULES.md`, `.env.example`, `app/*`, `HANDOFF_M00.md`, `HANDOFF_M01.md`.

## Dependencies

- `@supabase/supabase-js`
- `@supabase/ssr`

No other packages added (no Prisma, Drizzle, Firebase, MongoDB, Axios, Redux, or React Query).

## Environment variables

Required (still placeholders only in `.env.example`, no real values):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`GEMINI_API_KEY` remains declared but unvalidated — that belongs to a later module.

## Database

**Extensions:** `pgcrypto` (for `gen_random_uuid()`), `vector` (pgvector).

**Enums:** `incident_type` (flood, earthquake, fire, building_collapse, medical_emergency, missing_person, road_blockage, food_shortage, shelter_need, other), `incident_severity` (LOW/MODERATE/HIGH/CRITICAL), `incident_status` (NEW/VERIFIED/RESOLVED).

**Tables:**
- `incidents` — full field set from the PRD (report text, normalized text, language, type, summary, lat/lng, people/children/elderly counts, boolean risk flags, priority_score, severity, confidence, status, `embedding vector(768)`, timestamps). Embedding dimension 768 matches Gemini's `text-embedding-004`, the planned runtime embedding model — revisit if a different model is chosen in M11+.
- `incident_needs` — FK to `incidents`, `on delete cascade`.
- `knowledge_sources` — source-level metadata for the future RAG knowledge base.
- `knowledge_chunks` — FK to `knowledge_sources`, `on delete cascade`, `embedding vector(768)`, `metadata jsonb`.
- `incident_evidence` — FK to `incidents` (`cascade`) and `knowledge_sources` (`set null`).

**Constraints:** non-negative checks on counts, `priority_score` bounded 0–100, `confidence` bounded 0–1.

**Indexes:** `incidents(created_at, status, severity, incident_type)`, FK indexes on `incident_needs`, `knowledge_chunks`, `incident_evidence`; ivfflat pgvector indexes on both `embedding` columns.

**Trigger:** `incidents_set_updated_at` keeps `updated_at` current on every update.

**RLS:** Enabled on all five tables. Only `authenticated`-role `select` policies exist for now (read-only). No insert/update/delete policies and no public/anon "allow all" policy — writes are expected to go through server-side code using the service-role client until a coordinator role model exists (later module).

## Tests

- `npm install` — succeeded, 16 packages added, 0 vulnerabilities.
- `npm run lint` — passed, no errors or warnings.
- `npm run build` — succeeded (TypeScript check + static generation both passed).
- No live Supabase project is configured in this environment, so the migration was validated by manual SQL review (syntax, foreign keys, constraints, RLS enabled, indexes, no real credentials present) rather than by running it against a live database. The Supabase CLI is not installed in this environment and was not added, per module instructions to avoid unnecessary tooling.

## Known issues

- Migration has not been applied to a live Supabase instance (none configured). The next module that needs a live database should run `supabase db push` (or equivalent) against a real project before relying on the schema.

## Next module

M03 — Core Design System

## Important notes for next Claude

Before implementing M03, read in this order:
1. `AGENTS.md`
2. `CURRENT_STATE.md`
3. `ARCHITECTURE.md`
4. `PROJECT_RULES.md`
5. `HANDOFF_M02.md`

M03 should build the reusable RescueMesh design system (dark, calm, information-dense theme per PRD §11) without wiring it to real data, Supabase queries, AI, or the reporting/dashboard/map features themselves. Update `CURRENT_STATE.md` and produce `HANDOFF_M03.md` at the end.
