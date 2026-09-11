/**
 * Knowledge Retrieval (M12)
 *
 * Server-side only. The lightweight, per-query path: embed the user's
 * question, then call the `match_knowledge_chunks` Postgres function
 * (added in migration 00000000000004) to run one pgvector similarity
 * query. Never re-embeds or re-chunks the knowledge base — that is
 * `lib/rag/ingest.ts`'s job, run separately and much less often.
 */
import { createServiceClient } from '@/lib/supabase/server';
import { embedTexts } from '@/lib/ai/embeddings';
import type {
  KnowledgeCategory,
  KnowledgeLanguage,
} from '@/lib/supabase/types';

/** Default/maximum number of chunks returned per query. Matches the
 * M12 module prompt's "topK = 5, with a sensible hard maximum" — the
 * hard maximum (20) is also enforced inside the SQL function itself
 * via `least(match_count, 20)`, so a caller cannot request more chunks
 * than that even if this constant is bypassed. */
export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 20;

/**
 * Minimum cosine similarity (`1 - cosine_distance`, range [-1, 1]) for
 * a chunk to be considered relevant evidence.
 *
 * Set from REAL observed data during M12 verification (2026-09), using
 * the actual configured Gemini embedding model against the actual
 * ingested M11 corpus — not guessed. An off-topic control query
 * ("Tell me about the history of the Roman Empire.") scored 0.502-0.504
 * against the corpus — that is the embedding model's noise floor for
 * unrelated text, not zero, because short English passages share
 * enough structure to never approach 0 similarity. On-topic queries
 * (flood/earthquake/fire/building-collapse, 20 retrieved results
 * total) scored 0.649-0.768. The original launch default (0.5) sat
 * essentially on top of the noise floor rather than below it, which is
 * exactly why the off-topic control query incorrectly cleared it
 * (`knowledgeFound: true` for a question with no real RescueMesh
 * answer). 0.6 sits in the middle of the ~0.145 observed gap: comfortably
 * above every observed noise score, comfortably below every observed
 * true-positive score, with margin on both sides. See
 * HANDOFF_M12_VERIFICATION.md for the full observed data and test
 * transcript this was derived from. Re-derive this value the same way
 * (log real scores, don't guess) if the embedding model, corpus, or
 * outputDimensionality ever changes.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  documentId: string | null;
  title: string | null;
  slug: string | null;
  category: KnowledgeCategory | null;
  language: KnowledgeLanguage | null;
}

export type RetrievalResult =
  | { ok: true; data: RetrievedChunk[] }
  | {
      ok: false;
      reason: 'missing_api_key' | 'provider_error' | 'database_error';
      message: string;
    };

interface MatchChunkRow {
  id: string;
  source_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

/**
 * Embeds `query` and retrieves the top-K most similar knowledge
 * chunks above `DEFAULT_SIMILARITY_THRESHOLD`, optionally narrowed by
 * category/language. Returns an empty array (not an error) when
 * nothing clears the threshold — that is the expected, safe "no
 * sufficiently relevant knowledge" outcome the RAG route uses to avoid
 * hallucinating.
 */
export async function retrieveRelevantChunks(
  query: string,
  options?: {
    topK?: number;
    category?: KnowledgeCategory;
    language?: KnowledgeLanguage;
    similarityThreshold?: number;
  },
): Promise<RetrievalResult> {
  const topK = Math.max(1, Math.min(options?.topK ?? DEFAULT_TOP_K, MAX_TOP_K));
  const threshold =
    options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  const embeddingResult = await embedTexts([query], 'RETRIEVAL_QUERY');
  if (!embeddingResult.ok) {
    return {
      ok: false,
      reason:
        embeddingResult.reason === 'missing_api_key'
          ? 'missing_api_key'
          : 'provider_error',
      message: embeddingResult.message,
    };
  }

  const [queryEmbedding] = embeddingResult.data;

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return {
      ok: false,
      reason: 'database_error',
      message: 'Knowledge retrieval is currently unavailable.',
    };
  }

  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: queryEmbedding,
    match_count: topK,
    match_threshold: threshold,
    filter_category: options?.category ?? null,
    filter_language: options?.language ?? null,
  });

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        'RescueMesh retrieveRelevantChunks: RPC failed:',
        error.message,
      );
    }
    return {
      ok: false,
      reason: 'database_error',
      message: 'Unable to search knowledge base.',
    };
  }

  const rows = (data as MatchChunkRow[] | null) ?? [];
  const chunks: RetrievedChunk[] = rows.map((row) => {
    const metadata = row.metadata ?? {};
    return {
      id: row.id,
      sourceId: row.source_id,
      content: row.content,
      chunkIndex: row.chunk_index,
      similarity: row.similarity,
      documentId:
        typeof metadata.documentId === 'string' ? metadata.documentId : null,
      title: typeof metadata.title === 'string' ? metadata.title : null,
      slug: typeof metadata.slug === 'string' ? metadata.slug : null,
      category:
        typeof metadata.category === 'string'
          ? (metadata.category as KnowledgeCategory)
          : null,
      language:
        typeof metadata.language === 'string'
          ? (metadata.language as KnowledgeLanguage)
          : null,
    };
  });

  return { ok: true, data: chunks };
}
