import { NextRequest, NextResponse } from "next/server";
import { ingestPublishedKnowledge } from "@/lib/rag/ingest";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";

/**
 * POST /api/rag/ingest
 *
 * Triggers the ingestion pipeline: published `knowledge_documents` ->
 * chunk -> embed -> `knowledge_sources`/`knowledge_chunks`. This is the
 * expensive path (Gemini embedding calls) and must never be reachable
 * by an arbitrary/anonymous caller.
 *
 * Protection: the project has no admin authentication system yet (no
 * user roles, no coordinator login — confirmed by inspecting AGENTS.md
 * / ARCHITECTURE.md / the existing route handlers before writing
 * this), and building one solely to gate this one endpoint is out of
 * scope for M12. The smallest safe mechanism consistent with the
 * existing "server secrets, never exposed to the browser" convention
 * is a shared secret, `RAG_INGEST_SECRET`, that the caller must supply
 * via the `x-ingest-secret` header. If the secret is unset in the
 * environment, this endpoint is disabled outright (503) rather than
 * silently falling open — there is no "unprotected but allowed" state.
 */

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour — ingestion is expensive and infrequent.

export async function POST(request: NextRequest) {
  const secret = process.env.RAG_INGEST_SECRET;
  if (!secret || secret.trim() === "") {
    return NextResponse.json(
      { success: false, error: "Ingestion is currently unavailable." },
      { status: 503 }
    );
  }

  const providedSecret = request.headers.get("x-ingest-secret");
  if (!providedSecret || providedSecret !== secret) {
    // Same generic message whether the header is missing or wrong —
    // never confirm/deny which via the response.
    return NextResponse.json(
      { success: false, error: "Not authorized." },
      { status: 401 }
    );
  }

  const clientKey = getClientKey(request);
  if (!checkRateLimit(`rag-ingest:${clientKey}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const result = await ingestPublishedKnowledge();

    if (!result.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("RescueMesh POST /api/rag/ingest: failed:", result.error);
      }
      return NextResponse.json(
        { success: false, error: "Unable to complete ingestion." },
        { status: 500 }
      );
    }

    const { documentsProcessed, documentsIngested, documentsUnchanged, documentsFailed, chunksCreated, embeddingsCreated } =
      result.data;

    return NextResponse.json(
      {
        success: true,
        data: {
          documentsProcessed,
          documentsIngested,
          documentsUnchanged,
          documentsFailed,
          chunksCreated,
          embeddingsCreated,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    // createServiceClient() (missing Supabase config) or any other
    // unexpected error inside the pipeline lands here — never a raw
    // error/stack trace in the response.
    const message = err instanceof Error ? err.message : String(err);
    const isConfigError = /Missing required environment variable/.test(message);

    if (process.env.NODE_ENV === "development") {
      console.error("RescueMesh POST /api/rag/ingest: unexpected error:", message);
    }

    return NextResponse.json(
      {
        success: false,
        error: isConfigError
          ? "Ingestion is currently unavailable."
          : "Unable to complete ingestion.",
      },
      { status: isConfigError ? 503 : 500 }
    );
  }
}
