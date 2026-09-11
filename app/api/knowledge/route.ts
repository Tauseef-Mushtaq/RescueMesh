import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { KnowledgeCategory, KnowledgeDocumentRow, KnowledgeLanguage } from "@/lib/supabase/types";

/**
 * GET /api/knowledge
 *
 * Server-side read path for the M11 curated knowledge foundation.
 * Returns only published knowledge_documents rows — this is a static,
 * curated dataset, not RAG. No embeddings/vector search/Gemini call
 * happens here (that is explicitly out of scope for M11; see
 * HANDOFF_M11.md). Consistent with the existing GET /api/incidents
 * (M08) and GET /api/incidents/[id] (M09) routes: uses the trusted
 * server-role client, the browser never queries Supabase directly.
 *
 * Query params (all optional): category, language, limit.
 */

const KNOWLEDGE_COLUMNS =
  "id, title, slug, category, summary, content, source, language, published, created_at, updated_at";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;

const VALID_CATEGORIES: KnowledgeCategory[] = [
  "flood",
  "earthquake",
  "fire",
  "building_collapse",
  "medical_emergency",
  "missing_person",
  "road_blockage",
  "food_shortage",
  "shelter_need",
  "general",
];

const VALID_LANGUAGES: KnowledgeLanguage[] = ["English", "Urdu", "Roman Urdu"];

type PublicKnowledgeRow = Pick<
  KnowledgeDocumentRow,
  | "id"
  | "title"
  | "slug"
  | "category"
  | "summary"
  | "content"
  | "source"
  | "language"
  | "published"
  | "created_at"
  | "updated_at"
>;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const categoryParam = searchParams.get("category");
  const languageParam = searchParams.get("language");
  const limitParam = searchParams.get("limit");

  let limit = DEFAULT_LIST_LIMIT;
  if (limitParam) {
    const parsedLimit = Number(limitParam);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, MAX_LIST_LIMIT);
    }
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh GET /api/knowledge: Supabase service config missing.");
    }
    return NextResponse.json(
      { success: false, error: "Knowledge data is currently unavailable." },
      { status: 503 }
    );
  }

  // Published-only is enforced here explicitly, not just via RLS — the
  // service-role client bypasses RLS entirely, so this filter is the
  // actual gate that keeps draft/unpublished entries out of the public
  // response (the RLS policy on knowledge_documents is defense-in-depth
  // for any future direct/anon access path, not the sole safeguard here).
  let query = supabase
    .from("knowledge_documents")
    .select(KNOWLEDGE_COLUMNS)
    .eq("published", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true })
    .limit(limit);

  if (categoryParam && VALID_CATEGORIES.includes(categoryParam as KnowledgeCategory)) {
    query = query.eq("category", categoryParam);
  }
  if (languageParam && VALID_LANGUAGES.includes(languageParam as KnowledgeLanguage)) {
    query = query.eq("language", languageParam);
  }

  const { data, error } = await query.returns<PublicKnowledgeRow[]>();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh GET /api/knowledge: query failed:", error.message);
    }
    return NextResponse.json(
      { success: false, error: "Unable to load knowledge documents." },
      { status: 500 }
    );
  }

  const documents = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    category: row.category,
    summary: row.summary,
    content: row.content,
    source: row.source,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // `published` is intentionally omitted from the public response —
    // every row returned here is published by construction (see the
    // .eq("published", true) filter above), so echoing the flag back
    // adds nothing and only invites a client to assume it's meaningful
    // to check.
  }));

  return NextResponse.json({ success: true, data: documents }, { status: 200 });
}
