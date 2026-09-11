/**
 * Minimal, hand-written database types for the tables created in the
 * M02 migration. Intentionally NOT a full auto-generated Supabase
 * types file — expand this incrementally as later modules need more
 * precise typing (e.g. via `supabase gen types typescript`).
 */

export type IncidentType =
  | "flood"
  | "earthquake"
  | "fire"
  | "building_collapse"
  | "medical_emergency"
  | "missing_person"
  | "road_blockage"
  | "food_shortage"
  | "shelter_need"
  | "other";

export type IncidentSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type IncidentStatus = "NEW" | "VERIFIED" | "RESOLVED";

export interface IncidentRow {
  id: string;
  report_text: string;
  reporter_name?: string | null;
  reporter_contact?: string | null;
  image_url?: string | null;
  normalized_text: string | null;
  language: string | null;
  incident_type: IncidentType | null;
  summary: string | null;
  latitude: number | null;
  longitude: number | null;
  people_affected: number | null;
  children_count: number | null;
  elderly_count: number | null;
  mobility_impairment: boolean;
  medical_emergency: boolean;
  immediate_danger: boolean;
  food_shortage: boolean;
  water_risk: boolean;
  priority_score: number | null;
  severity: IncidentSeverity | null;
  confidence: number | null;
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
}

export interface IncidentNeedRow {
  id: string;
  incident_id: string;
  need_type: string;
  priority: number | null;
  created_at: string;
}

export interface KnowledgeSourceRow {
  id: string;
  title: string;
  description: string | null;
  source_url: string | null;
  source_type: string | null;
  /** Added in M12 — links this source back to the `knowledge_documents`
   * row it was ingested from. Unique (nullable, since a future source
   * type might not originate from a knowledge_documents row). */
  knowledge_document_id: string | null;
  /** Added in M12 — SHA-256 of the source document's title+summary+
   * content at last ingestion, used to detect "unchanged" vs.
   * "needs re-chunking/re-embedding" without comparing full content. */
  content_hash: string | null;
  created_at: string;
}

export interface KnowledgeChunkRow {
  id: string;
  source_id: string;
  content: string;
  chunk_index: number;
  /** vector(768) in Postgres; represented as a plain number array on
   * the JS side (pgvector <-> supabase-js). Not selected by
   * `GET /api/knowledge`-style read paths — internal to
   * `lib/rag/ingest.ts` / `lib/rag/retrieval.ts` only. */
  embedding: number[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface IncidentEvidenceRow {
  id: string;
  incident_id: string;
  claim: string;
  source_id: string | null;
  confidence: number | null;
  created_at: string;
}

/** Categories used by `knowledge_documents` (M11). Deliberately a plain
 * string union backed by a Postgres check constraint, not the shared
 * `incident_type` enum — "general" has no incident-type equivalent, and
 * extending the shared enum was out of scope for M11. */
export type KnowledgeCategory =
  | "flood"
  | "earthquake"
  | "fire"
  | "building_collapse"
  | "medical_emergency"
  | "missing_person"
  | "road_blockage"
  | "food_shortage"
  | "shelter_need"
  | "general";

/** Matches the existing `ExtractionLanguage` convention used by
 * `incidents.language` ("English" / "Urdu" / "Roman Urdu"). */
export type KnowledgeLanguage = "English" | "Urdu" | "Roman Urdu";

export interface KnowledgeDocumentRow {
  id: string;
  title: string;
  slug: string;
  category: KnowledgeCategory;
  summary: string;
  content: string;
  source: string | null;
  language: KnowledgeLanguage;
  published: boolean;
  created_at: string;
  updated_at: string;
}
