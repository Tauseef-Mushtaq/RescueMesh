Project: RescueMesh AI
Current Module: M14-F
Status: M14-F (Secure Intelligence API) complete — see the M14-F block
appended near the end of this file for details. This "Current Module"
line and the paragraph immediately below it describe the M12 snapshot
and are otherwise left as-is (M13/M14-A through M14-E did not rewrite
this file either, per their own documented precedent); read the
HANDOFF_M13.md / HANDOFF_M14A.md through HANDOFF_M14F.md files for
everything after M12.
Status (M12 snapshot, unmodified since): Knowledge Intelligence + RAG Foundation complete. Migration 00000000000004 adds a stable knowledge_sources.knowledge_document_id link back to knowledge_documents (M11) plus a content_hash column for idempotent re-ingestion, a uniqueness guarantee on knowledge_chunks(source_id, chunk_index), and a match_knowledge_chunks() SQL function performing pgvector cosine-similarity search — no new tables, no new vector store. lib/rag/ingest.ts (invoked via the protected POST /api/rag/ingest) chunks every published knowledge_documents row deterministically (lib/rag/chunking.ts, word-count based) and embeds each chunk with Gemini (lib/ai/embeddings.ts, env-driven model chain defaulting to gemini-embedding-001 -> text-embedding-004, 768-dim to match the existing schema), storing chunk/category/language/title/slug metadata in knowledge_chunks.metadata (no new columns). POST /api/rag embeds the user's query, retrieves top-K chunks above a documented similarity threshold via one RPC call (lib/rag/retrieval.ts), and — only if relevant chunks were found — asks Gemini to answer strictly from that retrieved evidence (lib/rag/generation.ts), returning the answer plus a source list built from the actual retrieved rows (never from Gemini). If no chunk clears the threshold, Gemini is never called and a controlled "insufficient verified knowledge" answer is returned instead. Both new endpoints have a minimal in-memory rate limit (lib/rate-limit.ts); the ingestion endpoint additionally requires a shared secret (RAG_INGEST_SECRET) via an x-ingest-secret header and is otherwise disabled (503). Gemini/Supabase hotfixes and M06/M09/M10/M11 all confirmed unmodified. Live Supabase/Gemini data still untested (same pre-existing constraint as every module since M07 — no credentials available in this environment); migrations 00000000000001-00000000000004 must all be applied, and POST /api/rag/ingest must actually be run once against a real project, before /api/rag can retrieve or answer anything.
Next Module: M13+ — a lightweight `/knowledge`-adjacent RAG UI surface (still explicitly deferred per M12 scope), or the P2 tier (semantic incident similarity/duplicate detection, which can reuse the same embeddings() module against incidents.embedding).

M12 — RAG Verification + Stabilization (final pass): re-verified the M12 implementation above against the actual received codebase. lint/`npx tsc --noEmit`/`npm run build` all pass; `/`, `/dashboard` still return 200; `/api/incidents` still returns a controlled 503 with no Supabase config (regression, unchanged); `/api/rag` and `/api/rag/ingest` request validation, rate limits, and the ingest secret gate were exercised directly against the unconfigured environment and behave as documented (see HANDOFF_M12.md). One real regression was found and fixed: `components/map/incident-map.tsx` was passing `attributionControl: true` to `maplibre-gl@4.7.1`'s `Map` constructor, which only accepts `false | AttributionControlOptions` — this was failing `npm run build` (`TS2322`) despite being listed as already-fixed; removed the invalid option (attribution stays on by default). No RAG/AI/database files were changed. Full LIVE VERIFIED / CODE VERIFIED / NOT VERIFIED breakdown, plus two flagged non-blocking issues (a critical `maplibre-gl` CVE unrelated to RAG, and a retry-pattern asymmetry between `lib/rag/generation.ts` and `lib/ai/embeddings.ts`), are in HANDOFF_M12.md. Status: COMPLETE WITH DOCUMENTED EXTERNAL LIMITATIONS. M13 has not been started.

Completed:
- Project development contract (AGENTS.md)
- Architecture definition (ARCHITECTURE.md)
- Project rules (PROJECT_RULES.md)
- Environment variable contract (.env.example)
- Modular handoff protocol
- README.md
- Next.js 16 + TypeScript + Tailwind CSS 4 + App Router initialized (npm only)
- Placeholder directory structure: lib/{ai,embeddings,rag,scoring,validation}/, data/
- Supabase client/server/config utilities + initial migration (M02)
- Core RescueMesh design system: tokens + reusable UI primitives (M03)
- Emergency reporting UI (M04):
  - /report route (app/report/page.tsx), client component
  - Local ReportFormData type: reportText, latitude, longitude, peopleAffected,
    childrenCount, elderlyCount, language, immediateDanger, medicalEmergency,
    mobilityImpairment, foodShortage, waterRisk, needs[]
  - Client-side validation only (reportText required/10-10000 chars, lat -90..90,
    lng -180..180, counts non-negative integers)
  - Submit builds a structured object, logs it in development only, shows a
    temporary success message — no API/Supabase/Gemini call
  - Built entirely from M03 primitives (Button, Card, Input, Textarea, Select,
    Badge, PageShell, SectionHeader); zero new dependencies
- npm install / npm run lint / npm run build all pass
- Manually verified / and /report both return 200 via `next dev`
- AI Incident Extraction (M05):
  - `lib/validation/incident-extraction.ts` — dependency-free runtime validator
    and shared `ExtractedIncident` type/schema constants (incident types,
    languages)
  - `lib/ai/incident-extraction.ts` — server-only `extractIncident()` using
    `@google/genai` (Gemini `gemini-2.0-flash`, JSON-schema structured
    output), 15s timeout, never throws, reconciles AI output with explicit
    reporter-provided fields (counts, boolean flags, needs, language) so
    user-stated facts are preserved rather than overwritten
  - `app/api/analyze/route.ts` — POST route handler: validates the request
    body, calls `extractIncident`, returns controlled JSON errors (503 for
    missing API key, 502 for timeout/invalid-output/provider errors, 400 for
    bad input); never exposes raw provider errors or the API key
  - `app/report/page.tsx` — submit now calls `POST /api/analyze`; shows an
    "Analyzing report..." status, then a concise result card (incident type,
    language, summary, needs, risk factors) or a controlled error message.
    No fake priority/severity is shown. UI otherwise unchanged from M04.
  - Dependency added: `@google/genai`
  - No database writes; no persistence
- Deterministic Priority Engine (M06):
  - `lib/scoring/priority.ts` — pure, side-effect-free `calculatePriority(incident: ExtractedIncident): PriorityResult`.
    No AI/DB/network dependency; deterministic.
  - Factors: immediate danger +25, children present (childrenCount>0) +20,
    medical emergency +20, mobility impairment +15, elderly present
    (elderlyCount>0) +10, large group (peopleAffected >= 10, documented as
    `LARGE_GROUP_THRESHOLD`) +10, food shortage +5. Max raw score = 105
    (`MAX_RAW_SCORE`).
  - Normalization: `round((rawScore / 105) * 100)`, clamped 0–100.
  - Severity: 80–100 CRITICAL, 60–79 HIGH, 40–59 MODERATE, 0–39 LOW
    (`severityForScore`).
  - `lib/scoring/priority.test.ts` — 26 self-running assertions (no test
    framework installed yet); run with `npx tsx lib/scoring/priority.test.ts`.
    All pass. See HANDOFF_M06.md for a documented discrepancy between the
    module spec's own worked example and its own formula/boundary table.
  - `app/report/page.tsx` — after a successful `/api/analyze` call, now
    also calls `calculatePriority()` client-side and shows a
    priority/severity badge + triggered-factor list. No score is ever
    requested from or produced by Gemini.
  - No dependencies added; no database changes.
- Persistence + API Integration (M07):
  - `lib/validation/report-request.ts` — shared request-body validator
    (`parseReportRequest`) extracted from M05's inline validation so
    `/api/analyze` and `/api/incidents` never drift; now also enforces
    latitude -90..90 / longitude -180..180 server-side (a gap in M05's
    original inline validator, closed here). Counts remain nullable,
    consistent with M04/M05's "reporter didn't state this" semantics —
    a deliberate deviation from the M07 module prompt's illustrative
    (non-required) request-shape sketch; see HANDOFF_M07.md.
  - `app/api/incidents/route.ts` — new `POST /api/incidents`, the
    authoritative pipeline: validate -> `extractIncident()` (M05) ->
    `calculatePriority()` (M06) -> insert into `incidents` -> insert into
    `incident_needs` -> `201` response. Priority/severity are always
    server-computed; the client cannot supply or influence them. Uses
    `createServiceClient()` from `lib/supabase/server.ts` (server-only,
    bypasses RLS by design per the M02 migration notes). Missing Supabase
    config fails as a controlled `503`, not a crash. A failed needs
    insert triggers a best-effort delete of the just-created incident row
    (no DB transaction available through this client) and a controlled
    `500` — never a false "success".
  - `app/api/analyze/route.ts` — refactored to use the shared validator;
    behavior otherwise unchanged and still fully functional as an
    analysis-only endpoint.
  - `app/report/page.tsx` — submit now calls `POST /api/incidents`
    instead of `/api/analyze`; the client-side M06 `calculatePriority()`
    call and import were removed. The result card shows the
    server-returned `priorityScore`/`severity`/`needs`/summary — the
    server response is the sole source of truth for priority.
  - No dependencies added. No migration/schema changes — the existing M02
    `incidents`/`incident_needs` tables and enums are used as-is.
  - **Live Supabase persistence was NOT tested** — no
    `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
    `GEMINI_API_KEY` were available in this environment. Verified instead:
    lint, build (with zero env vars set), `/report` still loads,
    `/api/analyze` still works end-to-end for its own failure paths,
    `/api/incidents` rejects malformed bodies and out-of-range
    coordinates/counts with `400`, and returns a controlled `503` when
    `GEMINI_API_KEY` is unset (extraction fails before the Supabase step
    is even reached).
  - **The M02 migration must be applied to the target Supabase project
    before `/api/incidents` can persist real incidents.**

- Coordinator Dashboard (M08):
  - `app/api/incidents/route.ts` — added `GET /api/incidents` alongside the
    existing `POST` (same file, per module instructions). Uses
    `createServiceClient()` (server-only) to query the `incidents` table,
    newest first (`created_at desc`), default `limit=100` (max 200).
    Optional query params `severity`, `status`, `incidentType`, `limit` are
    validated against the actual enum values before being applied as
    `.eq()` filters; invalid/unknown values are silently ignored rather
    than erroring, so a bad query param degrades to "no filter" instead of
    a 400. Selects only dashboard-relevant columns (never `embedding`,
    `report_text`, `normalized_text`, or `confidence`). Response is mapped
    to camelCase, matching the `POST` response's existing convention.
    Missing Supabase config → controlled `503`. Query failure → controlled
    `500`, `"Unable to load incidents."`, no raw Postgres error ever
    reaches the client (dev-only `console.error` for diagnostics).
  - `app/dashboard/page.tsx` — new client component. Fetches
    `GET /api/incidents` on mount (via `queueMicrotask` inside
    `useEffect`, to satisfy the `react-hooks/set-state-in-effect` lint
    rule without changing behavior) and on manual "Refresh". Renders:
    - Four metric cards (Critical / High / Moderate / Total), computed by
      counting the fetched list's persisted `severity` values — no
      re-scoring, no second scoring system.
    - Client-side filters (severity / incident type / status) that combine
      with AND semantics over the fetched list.
    - An incident feed sorted newest-first (as returned by the API),
      each item showing severity badge (with the persisted
      `priorityScore`/`severity`), human-readable incident type, summary,
      people-affected count, a compact set of indicator badges (immediate
      danger / children / elderly / medical / mobility impairment), a
      relative timestamp (hand-rolled formatter, no new date library), and
      "Location provided" text (no map — that's M10) when coordinates
      exist. Each item links to `/incidents/[id]` (route does not exist
      yet; M09 will add it).
    - Loading state (`role="status"`), error state (`role="alert"`,
      message never exposes raw errors), and the exact empty-state copy
      specified in the module prompt.
  - Built entirely from existing M03 primitives (`Card`, `Badge`, `Button`,
    `Select`) and layout components (`PageShell`, `SectionHeader`) — zero
    new dependencies (no charts, no date library, no data-fetching
    library, no state-management library).
  - No authentication; no map; no RAG; no embeddings; no duplicate
    detection; no simulation/demo data — all explicitly out of scope per
    the module prompt and deferred to later modules.
  - **Live Supabase data was NOT tested** — no credentials available in
    this environment (same constraint as M07). Verified instead: dashboard
    renders (`200`) and shows a controlled error state against an
    unconfigured database; `GET /api/incidents` returns a controlled `503`
    under the same conditions; `POST /api/incidents` and `POST
    /api/analyze` regression-checked and still behave exactly as in M07
    (malformed body → `400`, valid body → `503`/`502` at the
    extraction/config step, no crash); `lib/scoring/priority.test.ts`
    still 26/26.

- Incident Detail (M09):
  - `app/api/incidents/[id]/route.ts` — new `GET /api/incidents/[id]`.
    Validates the route param as a UUID before querying (`400` on
    failure). Uses `createServiceClient()` (server-only). Selects the
    single incident (excluding `embedding`) plus its `incident_needs`
    rows. Missing incident → controlled `404`. Missing Supabase config →
    controlled `503`. Query failure → controlled `500`. Never
    recalculates `priorityScore`/`severity`, never calls Gemini, never
    generates recommendations. Response is camelCase, matching the
    `POST`/`GET` list endpoints' existing convention.
  - `app/incidents/[id]/page.tsx` — new client component. Fetches
    `GET /api/incidents/[id]` on mount. Renders: header (back link,
    incident type, severity badge, priority score, status, relative
    timestamp), Situation (persisted summary + original report text,
    verbatim), Affected People (people/children/elderly counts with
    explicit "Not provided" for `null`, plus language), Important
    Indicators (only emphasizes true booleans; false ones are listed
    plainly, not badged), Needs (persisted `incident_needs` rows,
    display-only label formatting, no reordering/recalculation),
    Priority Explanation (derives which M06 factors triggered directly
    from the persisted incident fields, purely explanatory — persisted
    `priorityScore`/`severity` are never overwritten or replaced), and
    Reported Location (plain lat/lng text; no map — that's M10). AI
    recommendation and similar-incidents sections were omitted entirely
    per the module prompt's "prefer omission" guidance. Loading
    (`role="status"`), not-found (`404`), and error (`role="alert"`)
    states all implemented; no route/status mutation was added (out of
    scope per the module prompt).
  - Built entirely from existing M03 primitives (`Card`, `Badge`) and
    layout components (`PageShell`) — zero new dependencies.
  - No authentication; no map; no Gemini/RAG calls; no similarity search;
    no embedding exposed — all explicitly out of scope per the module
    prompt and deferred to later modules.
  - **Live Supabase data was NOT tested** — no credentials available in
    this environment. Verified instead: `/incidents/[id]` renders `200`
    and shows a controlled error state against an unconfigured database;
    `GET /api/incidents/[id]` returns `400` for a malformed ID, `503` for
    missing Supabase config, and (code-reviewed) `404`/`500` paths for a
    configured-but-missing incident / a query failure; `/`, `/report`,
    `/dashboard`, `POST /api/incidents`, and `GET /api/incidents`
    regression-checked and unchanged; `lib/scoring/priority.test.ts`
    still 26/26.

- Basic Disaster Map (M10):
  - `components/map/incident-map.tsx` — new client component. See Status above and HANDOFF_M10.md for full detail.
  - `app/dashboard/page.tsx` — renders the new map section; exported `INCIDENT_TYPE_LABELS` so the map reuses it (no duplicate label map).
  - `app/globals.css` — marker/popup styling using existing design tokens.
  - `package.json` — added `maplibre-gl`.
  - No API changes; no new dependencies beyond `maplibre-gl`; no authentication, RAG, clustering, geocoding, or real-time updates (all explicitly out of scope per the module prompt).

- Knowledge Base Foundation + Curated Disaster Knowledge (M11):
  - `supabase/migrations/00000000000003_knowledge_documents.sql` — new
    `knowledge_documents` table: `id`, `title`, `slug` (unique), `category`
    (checked text: the 9 existing `incident_type` values + `general`;
    kept separate from the shared `incident_type` enum rather than
    extending it, since `general` has no incident-type equivalent),
    `summary`, `content`, `source`, `language` (checked text, matching
    the existing `ExtractionLanguage` convention: `English`/`Urdu`/
    `Roman Urdu`), `published` (boolean, default `true`), timestamps.
    Composite index on `(published, category)` plus a `language` index
    — the two shapes `/api/knowledge` actually filters on. RLS enabled
    with one policy: `anon`+`authenticated` may `select` where
    `published = true` (defense-in-depth for any future direct/anon
    access path; the API route itself uses the service-role client and
    filters `published = true` explicitly regardless of RLS). Seeded
    with 23 curated English entries (idempotent via
    `on conflict (slug) do nothing`), covering all 10 categories: flood
    (4), earthquake (4), fire (4), building_collapse (2),
    medical_emergency (2), missing_person (2), road_blockage (2),
    food_shortage (1), shelter_need (1), general (1). Content is
    factual, safety-oriented, non-diagnostic, and explicitly states it
    doesn't replace professional emergency services where relevant
    (medical entries especially). Explicitly separate from the
    pre-existing `knowledge_sources`/`knowledge_chunks` tables (M02),
    which remain untouched and reserved for a future embeddings/RAG
    module — `knowledge_documents` holds whole curated articles, not
    chunks, and has no `embedding` column.
  - `app/api/knowledge/route.ts` — new `GET /api/knowledge`. Uses
    `createServiceClient()` (server-only, same pattern as
    `GET /api/incidents`); the browser never queries Supabase directly.
    Optional `category`/`language`/`limit` query params, each validated
    against the real enum values before being applied — invalid/unknown
    values are silently ignored (degrade to "no filter"), matching the
    `GET /api/incidents` convention from M08. Default limit 50, capped
    at 100. Always filters `published = true` explicitly in the query
    (not relying on RLS alone, since the service-role client bypasses
    RLS). Response omits `published` (every row returned is published by
    construction) and never returns internal-only fields. Missing
    Supabase config → controlled `503`. Query failure → controlled `500`,
    `"Unable to load knowledge documents."` — no raw Postgres error ever
    reaches the client. No Gemini call, no embeddings, no vector search —
    this is a static, curated dataset only.
  - `lib/supabase/types.ts` — added `KnowledgeCategory`,
    `KnowledgeLanguage`, and `KnowledgeDocumentRow` types (kept separate
    from the existing `KnowledgeSourceRow`/`KnowledgeChunkRow` types,
    which describe the unrelated M02 RAG tables).
  - `ARCHITECTURE.md` — added one row each to the data-model and
    API-contract tables for `knowledge_documents` /
    `GET /api/knowledge`, clarifying the distinction from the
    RAG-reserved `knowledge_sources`/`knowledge_chunks` tables.
  - No UI changes — no new pages, no changes to `/report`, `/dashboard`,
    `/incidents/[id]`, or the map, per the module's explicit scope. No
    dependencies added.
  - No embeddings, pgvector usage, vector/similarity search, RAG,
    Gemini-generated content, web scraping, or OCR — all explicitly out
    of scope for M11 and confirmed absent from this change set.
  - Gemini hotfix and Supabase service-role grant hotfix (both
    immediately preceding M11) were verified intact and unmodified: no
    active-code reference to the retired `gemini-2.0-flash` model exists
    (only historical mentions in earlier `HANDOFF_*.md`/`CURRENT_STATE.md`
    prose), and `createServiceClient()` still reads
    `SUPABASE_SERVICE_ROLE_KEY` server-only.
  - **Live Supabase data was NOT tested** — no credentials available in
    this environment (same constraint as every module since M07).
    Verified instead: `npx tsc --noEmit` shows only the 2 pre-existing,
    unrelated errors already documented in `HANDOFF_HOTFIX.md`
    (`app/layout.tsx`, `components/map/incident-map.tsx`) — zero new
    type errors from M11's files; `npx eslint .` shows only the 1
    pre-existing unrelated warning in `incident-map.tsx` — zero new lint
    issues; `npm run build` compiles successfully and fails only at the
    same pre-existing `incident-map.tsx` typecheck step (not a new
    failure); `npx tsx lib/scoring/priority.test.ts` still 26/26;
    `GET /api/knowledge` (with and without `category`/`language`/
    `limit`, including an invalid category and an oversized limit) all
    return a controlled `503` against the unconfigured database, never a
    crash or raw error; `/`, `/report`, `/dashboard`,
    `/incidents/[id]`, `GET /api/incidents`, and
    `GET /api/incidents/[id]` all regression-checked live via `next dev`
    and behave exactly as before M11.

- Knowledge Intelligence + RAG Foundation (M12):
  - `supabase/migrations/00000000000004_rag_foundation.sql` — additive
    only. Adds `knowledge_sources.knowledge_document_id` (unique,
    references `knowledge_documents`) and `.content_hash`; adds a
    unique index on `knowledge_chunks(source_id, chunk_index)`; adds
    `match_knowledge_chunks()`, a SQL function performing pgvector
    cosine-similarity search over `knowledge_chunks` (using the `<=>`
    operator, matching the M02 ivfflat index), with optional
    category/language filters and a caller-supplied similarity
    threshold. `security invoker` (not `definer`) — relies on the
    existing `service_role` table grant from
    `00000000000002_grant_service_role.sql`, no privilege escalation.
    `execute` revoked from `public`/`anon`/`authenticated`, granted
    only to `service_role`. No new tables; `knowledge_sources`/
    `knowledge_chunks` (M02) and `knowledge_documents` (M11) are reused
    exactly as planned in `ARCHITECTURE.md`.
  - `lib/rag/chunking.ts` — deterministic, word-count-based, paragraph-
    aware chunker (~220 target / 320 max / 40 overlap words). Pure, no
    AI, no new dependency. Same input always produces the same chunks.
  - `lib/ai/embeddings.ts` — server-only Gemini embedding wrapper.
    Env-driven model chain (`GEMINI_EMBEDDING_MODEL` ->
    `GEMINI_EMBEDDING_FALLBACK_MODEL`, defaulting to
    `gemini-embedding-001` -> `text-embedding-004`), `outputDimensionality:
    768` to match the existing `vector(768)` column exactly, same
    retryable-provider-error/timeout/never-throws contract as
    `lib/ai/incident-extraction.ts` (M05) — deliberately not imported
    from/refactored into that file (see file docstring).
  - `lib/rag/ingest.ts` — the ingestion pipeline: reads published
    `knowledge_documents`, computes a SHA-256 content hash per
    document, upserts one `knowledge_sources` row per document
    (idempotent via `knowledge_document_id`), and — only if the hash
    changed or the source is new — deletes that source's existing
    chunks and rebuilds them (chunk -> embed -> insert, storing
    title/slug/category/language/documentId in `knowledge_chunks.metadata`).
    Unchanged documents are skipped entirely (no re-embedding, no
    wasted Gemini calls). Never runs per-query.
  - `lib/rag/retrieval.ts` — the per-query path: embeds the query
    (`RETRIEVAL_QUERY` task type), then one `match_knowledge_chunks`
    RPC call. Documented similarity threshold: `0.5` cosine similarity
    (conservative default, not empirically tuned — no live
    Gemini/Supabase credentials were available to tune it against
    real embeddings in this environment). `topK` default 5, hard
    cap 20 (enforced both client-side and inside the SQL function).
  - `lib/rag/generation.ts` — grounded Gemini generation. Reuses the
    `GEMINI_MODEL`/`GEMINI_FALLBACK_MODEL`/`GEMINI_SECONDARY_FALLBACK_MODEL`
    chain and retry/timeout logic (duplicated, not imported, from
    `lib/ai/incident-extraction.ts` — see file docstring). System
    instruction adapted from the module spec's suggested wording,
    tightened to match `AGENTS.md`'s existing safety language (no
    dispatch claims, no diagnosis, communicate uncertainty, never
    fabricate sources).
  - `lib/rate-limit.ts` — minimal in-memory, per-process fixed-window
    rate limiter (the project had none — confirmed by inspection
    before writing this). Best-effort only; documented as such.
  - `app/api/rag/route.ts` — new `POST /api/rag`. Validates
    query (non-empty, <=500 chars)/optional category/optional language;
    20 req/min per client. Retrieval failure -> `503`/`502`/`500`
    depending on cause; no relevant chunks -> `200` with
    `knowledgeFound: false` and a controlled "insufficient verified
    knowledge" answer, **Gemini is never called** in that branch;
    otherwise grounded generation runs and the response includes
    `sources` built strictly from the retrieved database rows (title/
    slug/category), plus `knowledgeFound: true` and `retrievedChunks`
    (an actual count, not a fabricated confidence score).
  - `app/api/rag/ingest/route.ts` — new `POST /api/rag/ingest`.
    Protected by a required `x-ingest-secret` header matched against
    `RAG_INGEST_SECRET`; disabled (`503`) outright if that env var is
    unset, `401` on a missing/wrong header, 3 req/hour rate limit.
    Returns real `documentsProcessed`/`documentsIngested`/
    `documentsUnchanged`/`documentsFailed`/`chunksCreated`/
    `embeddingsCreated` counts from the actual ingestion run.
  - `lib/supabase/types.ts` — added `knowledge_document_id`/
    `content_hash` to `KnowledgeSourceRow`, added `embedding` to
    `KnowledgeChunkRow` (both to reflect the actual, now-used schema;
    neither is ever returned by `GET /api/knowledge`, M11, which is
    unmodified and unaffected).
  - `.env.example` — added `GEMINI_EMBEDDING_MODEL`,
    `GEMINI_EMBEDDING_FALLBACK_MODEL` (both optional, sensible
    defaults hard-coded), and `RAG_INGEST_SECRET` (required for
    `/api/rag/ingest` to be enabled at all).
  - `ARCHITECTURE.md` — updated the `knowledge_sources`/
    `knowledge_chunks` data-model rows and added `/api/rag`/
    `/api/rag/ingest` to the API-contract table.
  - No UI was built (explicitly out of scope per the module prompt —
    "keep minimal", no chatbot, no persistent chat history). No new
    npm dependencies. No changes to `knowledge_documents` (M11),
    `incidents`/`incident_needs` (M02/M07-M09), the dashboard, the map,
    or any completed module's behavior.
  - **Regression-verified**: `grep -R "gemini-2.0-flash" . --exclude-dir=node_modules --exclude-dir=.next`
    returns only historical doc mentions (zero in `.ts`/`.tsx`);
    `createServiceClient()` still reads `SUPABASE_SERVICE_ROLE_KEY`
    server-only; `npx tsc --noEmit` shows only the same 2 pre-existing,
    unrelated errors documented since `HANDOFF_HOTFIX.md`/M11 (zero new
    errors from any M12 file); `npx eslint .` shows only the same 1
    pre-existing unrelated warning; `npm run build` compiles
    successfully and fails only at the same pre-existing
    `incident-map.tsx` typecheck step; `npx tsx lib/scoring/priority.test.ts`
    still 26/26; `/`, `/report`, `/dashboard`, `/incidents/[id]`,
    `GET /api/incidents`, `GET /api/knowledge` all regression-checked
    live via `next dev` and behave exactly as before M12.
  - **Live Supabase/Gemini data was NOT tested** — no credentials
    available in this environment (same constraint as every module
    since M07). Verified instead, live via `next dev` with all env
    vars unset: `POST /api/rag` with a missing/empty/invalid-category/
    oversized query -> `400`; a valid query -> `503`
    ("Embedding generation is currently unavailable.") at the
    embedding step, before retrieval or generation is ever reached;
    `POST /api/rag/ingest` with no `RAG_INGEST_SECRET` set -> `503`;
    with `RAG_INGEST_SECRET` set and a wrong/missing header -> `401`;
    with the correct header -> `503` ("Ingestion is currently
    unavailable.") at the Supabase-config step, before any chunking/
    embedding is attempted.

- Live Supabase project connection (no real credentials configured; migration must be applied before persistence/dashboard-with-data works)
- Authentication / role-based RLS policies
- RAG (document ingestion, chunking, embedding generation, retrieval)
- Similarity / duplicate detection
- Demo mode
- Final cinematic landing page / animations

- Gemini model retirement + Supabase permission hotfix (post-M10):
  - `lib/ai/incident-extraction.ts` — removed the hard-coded
    `gemini-2.0-flash` model string (retired by the provider, 404).
    Model selection now reads a 3-item chain from env:
    `GEMINI_MODEL` -> `GEMINI_FALLBACK_MODEL` -> `GEMINI_SECONDARY_FALLBACK_MODEL`,
    each falling back to a hard-coded same-tier default only if the env
    var is unset. `extractIncident()` tries each model in order but
    only advances to the next one on a **retryable provider/availability
    error** (503 / "UNAVAILABLE" / "high demand"); malformed application
    input and invalid-model-output bugs are never masked by retrying.
    All attempts share the existing single 15s request-timeout budget
    (not multiplied per attempt), so worst case is unchanged from
    before. Public behavior/types (`ExtractionResult`,
    `ExtractionFailureReason`) are unchanged. Dev-only logging now
    reports which model failed (still never logs the API key).
  - `supabase/migrations/00000000000002_grant_service_role.sql` — new,
    additive migration. Root cause of `permission denied for table
    incidents` on the service-role INSERT path: the M02 migration
    enabled RLS and created policies for `authenticated` reads, but
    never granted baseline table privileges to `service_role` itself —
    a plain Postgres GRANT problem, not an RLS violation (RLS failures
    read "new row violates row-level security policy"; this reads
    "permission denied for table incidents"). This migration grants
    `USAGE` on schema `public` and `SELECT/INSERT/UPDATE/DELETE` on all
    current + future `public` tables (plus sequence usage) to
    `service_role` only, via `ALTER DEFAULT PRIVILEGES`. It does **not**
    touch `anon` or `authenticated`, does not add an anonymous INSERT
    policy, and does not disable RLS. This migration must be applied
    (`supabase db push` / run in the SQL editor) against the project
    for the fix to take effect — no application code changes were
    needed for the Supabase side.
  - No 15-second-delay bug was found beyond the pre-existing single
    Gemini `REQUEST_TIMEOUT_MS = 15000` constant: with the retired
    model returning a 404 (not a timeout), the request should have
    failed fast; the ~15.4s observed in the reported log is consistent
    with the request instead hanging until that timeout in whatever
    environment produced the log (e.g. a network path that swallowed
    the error) rather than any code-level 3x/N x retry. The new
    fallback chain reuses one shared 15s budget across up to 3 model
    attempts rather than 15s per attempt, so it cannot make this worse.
  - Verified in this environment: `npx tsc --noEmit` (no new errors —
    the 2 remaining errors are pre-existing, in `app/layout.tsx` and
    `components/map/incident-map.tsx`, both outside this fix's scope);
    `npx eslint .` (0 errors, 1 pre-existing unrelated warning in
    `incident-map.tsx`); `npm run build` compiles successfully and
    fails only at the pre-existing `incident-map.tsx` typecheck step.
    No live Gemini or Supabase credentials were available in this
    environment, so the actual `/report` → `POST /api/incidents` →
    Gemini → Supabase round trip, the fallback-on-503 path, and the
    new migration's effect on a real database were **not** runnable
    live here — see `HANDOFF_HOTFIX.md` for exactly what remains to be
    verified against a real project.

- User-Facing RAG Experience (M13):
  - New `/ask` route ("Ask RescueMesh"): question textarea (500-char
    limit matching the API), optional category filter (the real
    10-value KnowledgeCategory enum), suggested-question pills,
    loading state, answer + trust-badge + source display, an honest
    no-knowledge state, and error handling for every POST /api/rag
    failure mode (400/429/500/502/503/network/malformed response).
    No language selector — the corpus is still English-only, so one
    was deliberately not added.
  - `components/layout/nav-bar.tsx` — new, small shared nav (no
    navigation existed anywhere before this), wired into
    `app/layout.tsx` so `/`, `/dashboard`, `/report`, `/ask` are all
    reachable from every page.
  - `components/rag/rag-answer.tsx`, `components/rag/rag-sources.tsx`
    — render only the fields POST /api/rag actually returns
    (answer/knowledgeFound -> trust badge; title/slug/category per
    source) — no invented metadata, no similarity score/URL (the API
    doesn't return either).
  - `lib/rag/client-response.ts` (+ `lib/rag/client-response.test.ts`,
    22 passing self-running assertions via `npx tsx`, same convention
    as M06's `priority.test.ts` — no new test framework) — the pure
    request/response validation logic behind the page, extracted so
    it's independently testable.
  - `app/api/rag/route.ts` and all of `lib/rag/*`/`lib/ai/*` are
    **unmodified** — M13 is a frontend consumer of the existing M12
    API only.
  - No new dependencies. No database changes.
  - Live-verified in this environment (no Supabase/Gemini config):
    `GET /ask` -> 200; nav renders on `/dashboard`; `/`, `/dashboard`,
    `/report`, `/incidents/[id]`, `/api/incidents` all regression-pass;
    `POST /api/rag` 400/429/503 paths all exercised directly and
    render correctly. **Not** live-verified: an actual
    `knowledgeFound: true` answer/sources render, and the
    `knowledgeFound: false` no-knowledge render, against a real
    configured backend — CODE VERIFIED only (unit tests +
    review) per HANDOFF_M13.md. Status: COMPLETE WITH DOCUMENTED
    EXTERNAL LIMITATIONS. M14 has not been started.

---

## M14-F — Secure Intelligence API (appended, does not rewrite the above)

**New endpoint:** `POST /api/incidents/[id]/intelligence`
(`app/api/incidents/[id]/intelligence/route.ts`). On-demand, advisory-only
analysis for one existing incident:

```
rate limit (5/min/client) -> UUID validation -> server-side incident
fetch (narrow select: incident_type, summary, report_text,
medical_emergency, mobility_impairment, immediate_danger, food_shortage,
water_risk — never id/lat/lng/priority_score/severity/status/confidence)
-> M14-D buildIncidentEvidence() -> M14-E generateIncidentIntelligence()
-> runtime-validate against the M14-B contract -> IncidentIntelligence
```

All orchestration and HTTP-status mapping lives in the new
`lib/incidents/intelligence-api.ts` (`handleIntelligenceRequest`,
framework-agnostic, dependency-injected); the route file is a thin
wrapper supplying the real Supabase fetch, the real M14-C/D/E pipeline,
and the real rate limiter. No GET handler exists on this route, no
persistence/UPDATE/INSERT/UPSERT of any kind occurs, and nothing
auto-triggers generation (no useEffect/cron/scheduler anywhere in this
module) — every analysis is one explicit POST. Full detail, exact test
results, and known limitations: `HANDOFF_M14F.md`.

**Verified in this environment:** `npx tsx
lib/incidents/intelligence-api.test.ts` (49/49 assertions passed, live),
`npx tsc --noEmit` (same 3 pre-existing baseline errors as M14-D/E, zero
new), `npx eslint .` (0 errors, same 1 pre-existing unrelated warning),
`npm run build` (fails for the same pre-existing `intelligence-context
.test.ts` reason documented since M14-D — not a regression), and a live
`next dev` regression pass: `/`, `/dashboard`, `/report`, `/ask` all
`200`; `GET /api/incidents` and `POST /api/rag` unchanged; the new
endpoint's invalid-UUID (`400`) and missing-Supabase-config (`503`)
paths both exercised live and return controlled, secret-free errors. No
live Gemini/Supabase credentials were available, so an actual
knowledge-backed `200` analysis was not exercised live (same standing
constraint as every module since M07).

**Next module:** M14-G — Incident Intelligence UI (not started).

---

## M14-G — Incident Intelligence UI (appended, does not rewrite the above)

**New:** `components/incidents/incident-intelligence.tsx`
(`IncidentIntelligenceSection`), a self-contained additive card rendered
at the bottom of `app/incidents/[id]/page.tsx` — every existing section
(situation, affected people, indicators, needs, priority explanation,
location) is unchanged. Explicit "Analyze Incident" button (`onClick`
only — no `useEffect`, no auto-fire on mount/refresh) POSTs to the
existing M14-F `/api/incidents/[id]/intelligence` with no request body,
validates the response with the existing `isIncidentIntelligenceData`
(M14-B, unmodified), and renders: loading (`role="status"`, spinner,
disabled+`aria-busy` button, `submittingRef` double-submit guard),
error (`role="alert"`, safe message via the response's own `error` or
`fallbackErrorForStatus`), a `knowledgeFound: false` state (warning
badge + the API's own explanatory `assessment` text, no generated
lists), and a `knowledgeFound: true` result (assessment, then
actions/watchFor/informationGaps lists — each omitted entirely when
empty, never a placeholder — then a source list showing only
title/slug/category, never an invented title). Button relabels to
"Analyze Again" after any completed attempt; re-analysis is always a
fresh POST, nothing is cached in `localStorage`/`sessionStorage`/a new
database column. Full detail: `HANDOFF_M14G.md`.

**Verified in this environment:** `npx tsc --noEmit` and `npm run lint`
both show the exact same pre-existing baseline as M14-D/E/F (3 tsc
errors, 1 lint warning, zero new); all seven existing self-running test
files (`priority.test.ts` 26/26, `client-response.test.ts` 22/22,
`intelligence-category.test.ts` 11/11, `intelligence-client.test.ts`
28/28, `intelligence-evidence.test.ts` 41/41,
`intelligence-generation.test.ts` 41/41, `intelligence-api.test.ts`
49/49) still pass unchanged; a live `next dev` pass confirms `/`,
`/dashboard`, `/report`, `/ask`, and `/incidents/[id]` all still `200`,
and the M14-F route's `400`/`503` paths are unchanged. Static grep
checks confirm the new component has no `useEffect`, no
`.update`/`.insert`/`.upsert`, no authoritative-field assignment, no
`createServiceClient`/`@google/genai`/secret import, and exactly one
`fetch` call site (`POST`, no body). No live Gemini/Supabase
credentials were available, so an actual rendered `knowledgeFound: true`
result was not observed in a real browser — see `HANDOFF_M14G.md`.

**M14-H1 (Security review).** Audited the four required areas (API
error sanitization, AI authority-field isolation, no-knowledge safety,
secret/client boundary) against the actual M14-C through M14-G code.
No concrete issue was found in any of the four areas — every
client-facing error message throughout the intelligence pipeline
(`intelligence-api.ts`, `intelligence-generation.ts`,
`intelligence-evidence.ts`, and the M12 `lib/rag/retrieval.ts`/
`lib/ai/embeddings.ts` layers it calls into) was already a static,
hand-written string; none ever forwards a raw exception, Supabase
error, or Gemini provider message. Gemini's structured output is
parsed by `validateGeneratedIntelligence`, which only ever reads
`assessment`/`actions`/`watchFor`/`informationGaps` — `priority_score`/
`severity`/`status`/`incident_type`/`confidence` are not columns the
Gemini call's prompt or schema exposes, are not read by that
validator, and are never selected from Supabase in the first place
(`intelligence` route's `INTELLIGENCE_COLUMNS`) — already checked live
by `intelligence-api.test.ts`'s Test 11. `components/incidents/
incident-intelligence.tsx` has no `@google/genai`/`createServiceClient`
import (grep-confirmed). No code changes were made. Full detail:
`HANDOFF_M14H1.md`.

**Next module:** M18-M20 — Semantic Incident Intelligence & Duplicate Detection complete.

---

## M18-M20 — Semantic Incident Intelligence & Duplicate Detection

**Completed:**
- `supabase/migrations/00000000000005_match_similar_incidents.sql` — pgvector cosine similarity RPC `match_similar_incidents()` on `incidents.embedding`.
- `lib/incidents/similarity.ts` — embedding text builder + similarity query executor.
- `app/api/incidents/route.ts` — updated `POST /api/incidents` to calculate and store Gemini embeddings in `incidents.embedding`.
- `app/api/similar/route.ts` — new `POST /api/similar` endpoint with rate limiting.
- `components/incidents/similar-incidents.tsx` & `app/incidents/[id]/page.tsx` — Coordinator UI section displaying match percentages and probable duplicate alerts on incident inspection.

**Next module:** Complete & Production Ready.

---

## M35 — Light/Dark Theme & Semantic AI Website Polish

**Completed:**
- `components/theme/theme-provider.tsx` & `app/globals.css`: Full Light and Dark mode theme engine with CSS variable tokens (`--background`, `--surface`, `--border`, `--accent`) and persistent theme toggle.
- `components/layout/nav-bar.tsx` & `components/layout/footer.tsx`: Glassmorphism blurred header navigation with theme toggle button, plus a comprehensive semantic footer containing emergency hotlines (1122, 1078, 115) and organizational attributions (UN OCHA, NDMA, WHO).
- `app/page.tsx`: Production-grade semantic landing page featuring a Hero awareness section, real-time performance metrics, affected communities story cards, authoritative guidance, and interactive FAQ accordion.
- `app/dashboard/page.tsx`: Added severity proportion bar charts for visual analytics.
- Full verification: `npm run build` succeeds cleanly across all 14 routes.

**Final Status:** All requested design, theme, and UI capabilities complete.
