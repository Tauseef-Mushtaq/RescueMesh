-- RescueMesh AI — Initial schema (M02)
--
-- Establishes storage foundation only. No application logic, no
-- priority-scoring logic, no embedding-generation logic — those are
-- implemented in later modules (M04+, M11-M17).
--
-- Embedding dimension: 768, matching Gemini's text-embedding-004
-- embedding model, which is the planned runtime embedding provider
-- for RescueMesh (see PRD §17). This can be revisited if a different
-- embedding model is chosen in M11+.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";     -- pgvector, for embeddings

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type incident_type as enum (
  'flood',
  'earthquake',
  'fire',
  'building_collapse',
  'medical_emergency',
  'missing_person',
  'road_blockage',
  'food_shortage',
  'shelter_need',
  'other'
);

create type incident_severity as enum (
  'LOW',
  'MODERATE',
  'HIGH',
  'CRITICAL'
);

create type incident_status as enum (
  'NEW',
  'VERIFIED',
  'RESOLVED'
);

-- ---------------------------------------------------------------------------
-- incidents
-- ---------------------------------------------------------------------------

create table if not exists incidents (
  id                    uuid primary key default gen_random_uuid(),

  -- raw + normalized report content
  report_text           text not null,
  normalized_text       text,
  language              text,

  -- AI-derived classification (validated by application code before write)
  incident_type         incident_type,
  summary               text,

  -- location
  latitude               double precision,
  longitude              double precision,

  -- people / vulnerability signals
  people_affected        integer check (people_affected is null or people_affected >= 0),
  children_count         integer check (children_count is null or children_count >= 0),
  elderly_count           integer check (elderly_count is null or elderly_count >= 0),
  mobility_impairment      boolean not null default false,
  medical_emergency        boolean not null default false,
  immediate_danger          boolean not null default false,
  food_shortage              boolean not null default false,
  water_risk                  boolean not null default false,

  -- deterministic priority (computed by application code, not AI)
  priority_score              integer check (priority_score is null or (priority_score between 0 and 100)),
  severity                     incident_severity,
  confidence                    numeric(3, 2) check (confidence is null or (confidence between 0 and 1)),

  status                        incident_status not null default 'NEW',

  -- semantic similarity (populated in M18+)
  embedding                     vector(768),

  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create index if not exists incidents_created_at_idx on incidents (created_at desc);
create index if not exists incidents_status_idx on incidents (status);
create index if not exists incidents_severity_idx on incidents (severity);
create index if not exists incidents_incident_type_idx on incidents (incident_type);

-- Vector similarity index — created only once embeddings are populated
-- in practice, but declared now as part of the storage foundation.
create index if not exists incidents_embedding_idx
  on incidents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table incidents enable row level security;

-- ---------------------------------------------------------------------------
-- incident_needs
-- ---------------------------------------------------------------------------

create table if not exists incident_needs (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references incidents (id) on delete cascade,
  need_type     text not null,
  priority      integer check (priority is null or priority >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists incident_needs_incident_id_idx on incident_needs (incident_id);

alter table incident_needs enable row level security;

-- ---------------------------------------------------------------------------
-- knowledge_sources
-- ---------------------------------------------------------------------------

create table if not exists knowledge_sources (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  source_url    text,
  source_type   text,
  created_at    timestamptz not null default now()
);

alter table knowledge_sources enable row level security;

-- ---------------------------------------------------------------------------
-- knowledge_chunks
-- ---------------------------------------------------------------------------

create table if not exists knowledge_chunks (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references knowledge_sources (id) on delete cascade,
  content       text not null,
  chunk_index   integer not null default 0,
  embedding     vector(768),
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists knowledge_chunks_source_id_idx on knowledge_chunks (source_id);

create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table knowledge_chunks enable row level security;

-- ---------------------------------------------------------------------------
-- incident_evidence
-- ---------------------------------------------------------------------------

create table if not exists incident_evidence (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references incidents (id) on delete cascade,
  claim         text not null,
  source_id     uuid references knowledge_sources (id) on delete set null,
  confidence    numeric(3, 2) check (confidence is null or (confidence between 0 and 1)),
  created_at    timestamptz not null default now()
);

create index if not exists incident_evidence_incident_id_idx on incident_evidence (incident_id);
create index if not exists incident_evidence_source_id_idx on incident_evidence (source_id);

alter table incident_evidence enable row level security;

-- ---------------------------------------------------------------------------
-- updated_at trigger for incidents
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger incidents_set_updated_at
  before update on incidents
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS foundation
--
-- Authentication/authorization is not implemented yet (later module).
-- Public anonymous reporting will go through a controlled server-side
-- API route using the service-role key, which bypasses RLS by design.
-- Until roles exist, keep policies minimal: authenticated users may
-- read; no client-side writes are permitted yet. This intentionally
-- has NO "allow everything" policy for anon/public.
-- ---------------------------------------------------------------------------

create policy "authenticated_read_incidents"
  on incidents for select
  to authenticated
  using (true);

create policy "authenticated_read_incident_needs"
  on incident_needs for select
  to authenticated
  using (true);

create policy "authenticated_read_knowledge_sources"
  on knowledge_sources for select
  to authenticated
  using (true);

create policy "authenticated_read_knowledge_chunks"
  on knowledge_chunks for select
  to authenticated
  using (true);

create policy "authenticated_read_incident_evidence"
  on incident_evidence for select
  to authenticated
  using (true);

-- No insert/update/delete policies are created in M02. Writes happen
-- through server-side code using the service-role client until a
-- coordinator role model is introduced in a later module.
