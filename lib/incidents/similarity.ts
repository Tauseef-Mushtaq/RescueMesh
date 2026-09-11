/**
 * Incident Similarity & Duplicate Search Utility (M18)
 *
 * Provides functions to:
 * 1. Search for similar incidents given a vector embedding or incident ID using match_similar_incidents RPC.
 * 2. Format incident text for embedding generation.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/ai/embeddings";
import type { IncidentSeverity, IncidentStatus, IncidentType } from "@/lib/supabase/types";

export interface SimilarIncidentResult {
  id: string;
  summary: string | null;
  reportText: string;
  incidentType: IncidentType | null;
  severity: IncidentSeverity | null;
  status: IncidentStatus;
  createdAt: string;
  similarity: number; // 0 to 1
  similarityPercentage: number; // 0 to 100
}

export type FindSimilarFailureReason =
  | "missing_supabase_config"
  | "missing_api_key"
  | "embedding_failed"
  | "database_error"
  | "incident_not_found";

export type FindSimilarResult =
  | { ok: true; matches: SimilarIncidentResult[] }
  | { ok: false; reason: FindSimilarFailureReason; message: string };

/**
 * Builds a clean, concise text string from incident details for embedding generation.
 */
export function buildIncidentEmbeddingText(reportText: string, summary?: string | null, incidentType?: IncidentType | null): string {
  const parts: string[] = [];
  if (incidentType) {
    parts.push(`Type: ${incidentType.replace(/_/g, " ")}`);
  }
  if (summary) {
    parts.push(`Summary: ${summary.trim()}`);
  }
  if (reportText) {
    parts.push(`Report: ${reportText.trim()}`);
  }
  return parts.join("\n").slice(0, 1000);
}

/**
 * Finds similar incidents in pgvector using a vector query or text query.
 */
export async function findSimilarIncidents(options: {
  queryEmbedding?: number[];
  queryText?: string;
  excludeIncidentId?: string;
  threshold?: number;
  limit?: number;
}): Promise<FindSimilarResult> {
  const { excludeIncidentId, threshold = 0.5, limit = 5 } = options;

  let embedding = options.queryEmbedding;

  if (!embedding) {
    if (!options.queryText) {
      return { ok: false, reason: "embedding_failed", message: "Either queryEmbedding or queryText must be provided." };
    }

    const embedRes = await embedTexts([options.queryText], "RETRIEVAL_QUERY");
    if (!embedRes.ok) {
      return {
        ok: false,
        reason: embedRes.reason === "missing_api_key" ? "missing_api_key" : "embedding_failed",
        message: embedRes.message,
      };
    }
    embedding = embedRes.data[0];
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return {
      ok: false,
      reason: "missing_supabase_config",
      message: "Supabase service-role client is unavailable.",
    };
  }

  const { data, error } = await supabase.rpc("match_similar_incidents", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: limit,
    exclude_incident_id: excludeIncidentId || null,
  });

  if (error) {
    return {
      ok: false,
      reason: "database_error",
      message: "Failed to query similar incidents from database.",
    };
  }

  const matches: SimilarIncidentResult[] = (data || []).map((row: any) => ({
    id: row.id,
    summary: row.summary,
    reportText: row.report_text,
    incidentType: row.incident_type,
    severity: row.severity,
    status: row.status,
    createdAt: row.created_at,
    similarity: row.similarity,
    similarityPercentage: Math.round(row.similarity * 100),
  }));

  return { ok: true, matches };
}
