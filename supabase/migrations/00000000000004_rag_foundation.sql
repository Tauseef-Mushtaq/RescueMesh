-- RescueMesh AI — Knowledge Intelligence + RAG Foundation (M12)
--
-- This migration is intentionally small and additive. It does NOT
-- recreate or duplicate `knowledge_sources` / `knowledge_chunks` (M02)
-- or `knowledge_documents` (M11) — those already exist and already
-- have everything a RAG pipeline needs (a vector(768) embedding column
-- with an ivfflat cosine index, a jsonb metadata column on chunks,
-- pgvector already enabled). It only adds:
--
--   1. A stable, idempotent link from `knowledge_sources` back to the
--      `knowledge_documents` row it was ingested from, plus a content
--      hash so repeated ingestion can detect "unchanged" vs. "needs
--      re-chunking/re-embedding" without re-embedding everything.
--   2. A uniqueness guarantee on (source_id, chunk_index) so ingestion
--      can upsert chunks instead of accumulating duplicates.
--   3. A single SQL function, `match_knowledge_chunks`, that performs
--      the actual pgvector cosine-similarity search. Supabase-js has no
--      client-side way to `ORDER BY embedding <=> query_embedding`, so a
--      server-side function (called via `.rpc()`, from the existing
--      server-only Supabase client) is the smallest correct mechanism —
--      not a new database, not a second vector store.
--
-- No columns are added to `knowledge_documents` or `knowledge_chunks`
-- themselves; `knowledge_chunks.metadata` (already jsonb, already
-- present) is used to carry title/slug/category/language/documentId
-- for each chunk instead of introducing duplicate columns.

-- ---------------------------------------------------------------------------
-- knowledge_sources: link back to knowledge_documents + change detection
-- ---------------------------------------------------------------------------

alter table knowledge_sources
  add column if not exists knowledge_document_id uuid
    references knowledge_documents (id) on delete cascade;

alter table knowledge_sources
  add column if not exists content_hash text;

-- One knowledge_sources row per knowledge_documents row. Lets ingestion
-- look up "does a source already exist for this document?" in one
-- query and upsert on conflict, instead of guessing by title.
create unique index if not exists knowledge_sources_document_id_key
  on knowledge_sources (knowledge_document_id)
  where knowledge_document_id is not null;

-- ---------------------------------------------------------------------------
-- knowledge_chunks: idempotent chunk identity
-- ---------------------------------------------------------------------------

-- Lets ingestion upsert chunks by (source_id, chunk_index) instead of
-- deleting/reinserting blindly or accumulating duplicates on repeated
-- runs.
create unique index if not exists knowledge_chunks_source_chunk_idx_key
  on knowledge_chunks (source_id, chunk_index);

-- ---------------------------------------------------------------------------
-- match_knowledge_chunks: server-side vector similarity search
-- ---------------------------------------------------------------------------
--
-- Distance operator: `<=>` is pgvector's cosine-distance operator,
-- matching the ivfflat index already declared on knowledge_chunks
-- (`vector_cosine_ops`, from the M02 migration) — using a different
-- operator here would not use that index. Cosine distance is in
-- [0, 2]; this function converts it to cosine similarity in [-1, 1]
-- via `1 - distance` (the conventional transform, and the one the
-- ivfflat `vector_cosine_ops` index is built for) so the caller can
-- reason in "higher is more similar" terms and apply a single
-- documented threshold (see lib/rag/retrieval.ts for the threshold
-- value and rationale).
--
-- `security invoker` (the default) is used deliberately, NOT
-- `security definer`: the calling role (service_role, from the
-- existing server-only Supabase client) already has SELECT on
-- knowledge_chunks via the service-role grant added in
-- 00000000000002_grant_service_role.sql, so no privilege escalation
-- is needed. EXECUTE is revoked from anon/authenticated/public and
-- granted only to service_role, so this function is not reachable
-- from a direct anon/authenticated database connection — only through
-- the trusted server-side Route Handler.
create or replace function match_knowledge_chunks(
  query_embedding vector(768),
  match_count int default 5,
  match_threshold float default 0.5,
  filter_category text default null,
  filter_language text default null
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    kc.id,
    kc.source_id,
    kc.content,
    kc.chunk_index,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where kc.embedding is not null
    and (filter_category is null or kc.metadata ->> 'category' = filter_category)
    and (filter_language is null or kc.metadata ->> 'language' = filter_language)
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding asc
  limit greatest(1, least(match_count, 20));
$$;

revoke all on function match_knowledge_chunks(vector, int, float, text, text) from public;
grant execute on function match_knowledge_chunks(vector, int, float, text, text) to service_role;
