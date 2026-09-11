import { NextRequest, NextResponse } from "next/server";
import { retrieveRelevantChunks } from "@/lib/rag/retrieval";
import { generateGroundedAnswer } from "@/lib/rag/generation";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import type { KnowledgeCategory, KnowledgeLanguage } from "@/lib/supabase/types";

/**
 * POST /api/rag
 *
 * query -> embed -> vector similarity search (top-K, threshold-gated)
 * -> grounded Gemini generation -> answer + source attribution.
 *
 * Never lets Gemini answer from its own general knowledge: if
 * retrieval finds no chunk above the documented similarity threshold
 * (`lib/rag/retrieval.ts`), this route returns a controlled
 * "insufficient verified knowledge" answer with `knowledgeFound:
 * false` and never calls Gemini at all — there is nothing safe for it
 * to be grounded in.
 */

const MAX_QUERY_LENGTH = 500;
const NO_KNOWLEDGE_ANSWER =
  "I couldn't find enough verified RescueMesh knowledge to answer that safely. Please consult local authorities or emergency services for guidance on this topic.";

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

interface RagRequestBody {
  query: string;
  category?: KnowledgeCategory;
  language?: KnowledgeLanguage;
}

function parseRequestBody(body: unknown): RagRequestBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;

  if (typeof record.query !== "string") return null;
  const query = record.query.trim();
  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) return null;

  let category: KnowledgeCategory | undefined;
  if (record.category !== undefined) {
    if (typeof record.category !== "string" || !VALID_CATEGORIES.includes(record.category as KnowledgeCategory)) {
      return null;
    }
    category = record.category as KnowledgeCategory;
  }

  let language: KnowledgeLanguage | undefined;
  if (record.language !== undefined) {
    if (typeof record.language !== "string" || !VALID_LANGUAGES.includes(record.language as KnowledgeLanguage)) {
      return null;
    }
    language = record.language as KnowledgeLanguage;
  }

  return { query, category, language };
}

// 20 requests/minute per client — generous enough for normal use,
// restrictive enough to blunt casual abuse. See lib/rate-limit.ts.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const clientKey = getClientKey(request);
  if (!checkRateLimit(`rag:${clientKey}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again shortly." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = parseRequestBody(body);
  if (!parsed) {
    return NextResponse.json(
      { success: false, error: "Invalid or incomplete query." },
      { status: 400 }
    );
  }

  // 1. Retrieval — embeds the query, then one pgvector similarity
  //    query. Never re-embeds or re-chunks the knowledge base.
  const retrieval = await retrieveRelevantChunks(parsed.query, {
    category: parsed.category,
    language: parsed.language,
  });

  if (!retrieval.ok) {
    const status = retrieval.reason === "missing_api_key" ? 503 : retrieval.reason === "database_error" ? 500 : 502;
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh POST /api/rag: retrieval failed:", retrieval.reason, retrieval.message);
    }
    return NextResponse.json({ success: false, error: retrieval.message }, { status });
  }

  const chunks = retrieval.data;

  // 2. No sufficiently relevant knowledge — return a controlled,
  //    honest answer. Gemini is never called in this branch: there is
  //    no verified evidence to ground it in, per AGENTS.md's "never
  //    fabricate a source" / "when evidence is insufficient, explicitly
  //    communicate uncertainty" rules.
  if (chunks.length === 0) {
    return NextResponse.json(
      {
        success: true,
        data: {
          answer: NO_KNOWLEDGE_ANSWER,
          sources: [],
          knowledgeFound: false,
          retrievedChunks: 0,
        },
      },
      { status: 200 }
    );
  }

  // 3. Grounded generation — Gemini receives only the retrieved
  //    evidence and is instructed not to introduce new facts.
  const generation = await generateGroundedAnswer(parsed.query, chunks);

  if (!generation.ok) {
    const status = generation.reason === "missing_api_key" ? 503 : 502;
    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh POST /api/rag: generation failed:", generation.reason, generation.message);
    }
    return NextResponse.json({ success: false, error: generation.message }, { status });
  }

  // Source list is built from the actual retrieved database rows, not
  // from anything Gemini said — Gemini never supplies URLs/titles.
  const seenSlugs = new Set<string>();
  const sources = chunks
    .filter((chunk) => {
      const key = chunk.slug ?? chunk.sourceId;
      if (seenSlugs.has(key)) return false;
      seenSlugs.add(key);
      return true;
    })
    .map((chunk) => ({
      title: chunk.title,
      slug: chunk.slug,
      category: chunk.category,
    }));

  return NextResponse.json(
    {
      success: true,
      data: {
        answer: generation.answer,
        sources,
        knowledgeFound: true,
        retrievedChunks: chunks.length,
      },
    },
    { status: 200 }
  );
}
