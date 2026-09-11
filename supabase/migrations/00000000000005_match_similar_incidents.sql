-- RescueMesh AI — Semantic Incident Similarity (M18)
--
-- Adds match_similar_incidents function for pgvector similarity search on incidents.embedding

create or replace function match_similar_incidents (
  query_embedding vector(768),
  match_threshold float default 0.6,
  match_count int default 5,
  exclude_incident_id uuid default null
)
returns table (
  id uuid,
  summary text,
  report_text text,
  incident_type incident_type,
  severity incident_severity,
  status incident_status,
  created_at timestamptz,
  similarity float
)
language sql stable
security invoker
as $$
  select
    incidents.id,
    incidents.summary,
    incidents.report_text,
    incidents.incident_type,
    incidents.severity,
    incidents.status,
    incidents.created_at,
    1 - (incidents.embedding <=> query_embedding) as similarity
  from incidents
  where incidents.embedding is not null
    and (exclude_incident_id is null or incidents.id <> exclude_incident_id)
    and 1 - (incidents.embedding <=> query_embedding) >= match_threshold
  order by incidents.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

revoke execute on function match_similar_incidents(vector(768), float, int, uuid) from public, anon, authenticated;
grant execute on function match_similar_incidents(vector(768), float, int, uuid) to service_role;
