/**
 * Knowledge Ingestion Pipeline (M12)
 *
 * Server-side only. Turns published `knowledge_documents` rows (M11)
 * into retrievable `knowledge_sources` / `knowledge_chunks` rows (M02),
 * per the architecture:
 *
 *   knowledge_documents (curated source of truth)
 *         -> knowledge_sources (source metadata, one per document)
 *         -> knowledge_chunks (chunked content + embedding)
 *
 * This is the expensive, infrequent path — it must NOT run per query.
 * `lib/rag/retrieval.ts` (the per-query path) never imports this file.
 *
 * Idempotent: each `knowledge_documents` row maps to exactly one
 * `knowledge_sources` row (unique on `knowledge_document_id`). A
 * SHA-256 hash of the document's `title + summary + content` is stored
 * on that source row; if a re-ingestion run sees the same hash, that
 * document's chunks are left untouched (no re-chunking, no
 * re-embedding, no wasted Gemini calls). If the hash differs (content
 * changed) or the source doesn't exist yet, this document's existing
 * chunks (if any) are deleted and rebuilt from scratch — never merged
 * with stale chunks from an old version of the text.
 *
 * Enforces `published = true` server-side (never trusts a caller-
 * supplied flag) — the same explicit-filter convention already used by
 * `GET /api/knowledge` (M11).
 */
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { chunkText } from "@/lib/rag/chunking";
import { embedTexts } from "@/lib/ai/embeddings";
import type { KnowledgeDocumentRow } from "@/lib/supabase/types";

export interface IngestionDocumentResult {
  documentId: string;
  slug: string;
  status: "ingested" | "unchanged" | "failed";
  chunksCreated: number;
  embeddingsCreated: number;
  error?: string;
}

export interface IngestionSummary {
  documentsProcessed: number;
  documentsIngested: number;
  documentsUnchanged: number;
  documentsFailed: number;
  chunksCreated: number;
  embeddingsCreated: number;
  results: IngestionDocumentResult[];
}

function hashDocument(doc: Pick<KnowledgeDocumentRow, "title" | "summary" | "content">): string {
  return createHash("sha256")
    .update(`${doc.title}\n${doc.summary}\n${doc.content}`)
    .digest("hex");
}

type Supabase = ReturnType<typeof createServiceClient>;

interface ExistingSource {
  id: string;
  content_hash: string | null;
}

async function upsertSource(
  supabase: Supabase,
  doc: Pick<KnowledgeDocumentRow, "id" | "title" | "summary">,
  contentHash: string
): Promise<{ id: string; changed: boolean } | { error: string }> {
  const { data: existing, error: fetchError } = await supabase
    .from("knowledge_sources")
    .select("id, content_hash")
    .eq("knowledge_document_id", doc.id)
    .maybeSingle<ExistingSource>();

  if (fetchError) {
    return { error: fetchError.message };
  }

  if (existing) {
    if (existing.content_hash === contentHash) {
      return { id: existing.id, changed: false };
    }

    const { error: updateError } = await supabase
      .from("knowledge_sources")
      .update({
        title: doc.title,
        description: doc.summary,
        source_type: "knowledge_document",
        content_hash: contentHash,
      })
      .eq("id", existing.id);

    if (updateError) {
      return { error: updateError.message };
    }
    return { id: existing.id, changed: true };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("knowledge_sources")
    .insert({
      title: doc.title,
      description: doc.summary,
      source_type: "knowledge_document",
      knowledge_document_id: doc.id,
      content_hash: contentHash,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "insert failed" };
  }

  return { id: inserted.id, changed: true };
}

/**
 * Ingests every published `knowledge_documents` row. Safe to call
 * repeatedly (idempotent — see module docstring). Never throws; any
 * per-document failure is captured in that document's result and does
 * not stop the rest of the batch.
 */
export async function ingestPublishedKnowledge(): Promise<
  { ok: true; data: IngestionSummary } | { ok: false; error: string }
> {
  const supabase = createServiceClient();

  const { data: documents, error: docsError } = await supabase
    .from("knowledge_documents")
    .select("id, title, slug, category, summary, content, language")
    .eq("published", true)
    .returns<
      Pick<
        KnowledgeDocumentRow,
        "id" | "title" | "slug" | "category" | "summary" | "content" | "language"
      >[]
    >();

  if (docsError) {
    return { ok: false, error: docsError.message };
  }

  const results: IngestionDocumentResult[] = [];
  let chunksCreated = 0;
  let embeddingsCreated = 0;

  for (const doc of documents ?? []) {
    const contentHash = hashDocument(doc);
    const sourceResult = await upsertSource(supabase, doc, contentHash);

    if ("error" in sourceResult) {
      results.push({
        documentId: doc.id,
        slug: doc.slug,
        status: "failed",
        chunksCreated: 0,
        embeddingsCreated: 0,
        error: sourceResult.error,
      });
      continue;
    }

    if (!sourceResult.changed) {
      results.push({
        documentId: doc.id,
        slug: doc.slug,
        status: "unchanged",
        chunksCreated: 0,
        embeddingsCreated: 0,
      });
      continue;
    }

    const sourceId = sourceResult.id;

    // Content changed (or this is a brand-new source) — rebuild this
    // document's chunks from scratch rather than trying to diff them,
    // to avoid stale retrieval results from a mix of old/new chunks.
    const { error: deleteError } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("source_id", sourceId);

    if (deleteError) {
      results.push({
        documentId: doc.id,
        slug: doc.slug,
        status: "failed",
        chunksCreated: 0,
        embeddingsCreated: 0,
        error: deleteError.message,
      });
      continue;
    }

    const textChunks = chunkText(`${doc.summary}\n\n${doc.content}`);

    if (textChunks.length === 0) {
      results.push({
        documentId: doc.id,
        slug: doc.slug,
        status: "ingested",
        chunksCreated: 0,
        embeddingsCreated: 0,
      });
      continue;
    }

    const embeddingResult = await embedTexts(
      textChunks.map((c) => c.content),
      "RETRIEVAL_DOCUMENT"
    );

    if (!embeddingResult.ok) {
      results.push({
        documentId: doc.id,
        slug: doc.slug,
        status: "failed",
        chunksCreated: 0,
        embeddingsCreated: 0,
        error: embeddingResult.message,
      });
      continue;
    }

    const chunkRows = textChunks.map((chunk, i) => ({
      source_id: sourceId,
      content: chunk.content,
      chunk_index: chunk.index,
      embedding: embeddingResult.data[i],
      metadata: {
        documentId: doc.id,
        title: doc.title,
        slug: doc.slug,
        category: doc.category,
        language: doc.language,
      },
    }));

    const { error: insertChunksError } = await supabase
      .from("knowledge_chunks")
      .insert(chunkRows);

    if (insertChunksError) {
      results.push({
        documentId: doc.id,
        slug: doc.slug,
        status: "failed",
        chunksCreated: 0,
        embeddingsCreated: 0,
        error: insertChunksError.message,
      });
      continue;
    }

    chunksCreated += chunkRows.length;
    embeddingsCreated += chunkRows.length;

    results.push({
      documentId: doc.id,
      slug: doc.slug,
      status: "ingested",
      chunksCreated: chunkRows.length,
      embeddingsCreated: chunkRows.length,
    });
  }

  const documentsIngested = results.filter((r) => r.status === "ingested").length;
  const documentsUnchanged = results.filter((r) => r.status === "unchanged").length;
  const documentsFailed = results.filter((r) => r.status === "failed").length;

  return {
    ok: true,
    data: {
      documentsProcessed: results.length,
      documentsIngested,
      documentsUnchanged,
      documentsFailed,
      chunksCreated,
      embeddingsCreated,
      results,
    },
  };
}
