/**
 * Pure, testable helpers for the "Ask RescueMesh" client (M13).
 * Extracted out of app/ask/page.tsx so the response-shape/validation
 * logic can be unit-tested without rendering React — same rationale
 * as lib/scoring/priority.ts being pulled out of app/report/page.tsx
 * in M06.
 *
 * Mirrors app/api/rag/route.ts's actual response contract; does not
 * invent fields.
 */
import type { KnowledgeCategory } from "@/lib/supabase/types";

/** Must match app/api/rag/route.ts's MAX_QUERY_LENGTH exactly. */
export const MAX_QUERY_LENGTH = 500;

export interface RagSource {
  title: string | null;
  slug: string | null;
  category: KnowledgeCategory | null;
}

export interface RagSuccessData {
  answer: string;
  sources: RagSource[];
  knowledgeFound: boolean;
  retrievedChunks: number;
}

/** A trimmed question is submittable iff it's non-empty and within
 * the server's own length limit. Mirrors the server's own check
 * (`query.length === 0 || query.length > MAX_QUERY_LENGTH`) so the
 * client never sends a request the server is guaranteed to reject. */
export function isValidQuestion(question: string): boolean {
  const trimmed = question.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_QUERY_LENGTH;
}

/** Runtime type guard for `POST /api/rag`'s success `data` payload —
 * used so a malformed/unexpected response is treated as an error
 * state rather than rendered as if it were a real answer. */
export function isRagSuccessData(value: unknown): value is RagSuccessData {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.answer === "string" &&
    Array.isArray(record.sources) &&
    typeof record.knowledgeFound === "boolean" &&
    typeof record.retrievedChunks === "number"
  );
}

/** Plain-language fallback, used only when the API response itself
 * didn't include an `error` message (it normally does — see
 * app/api/rag/route.ts — this is a last-resort backstop). */
export function fallbackErrorForStatus(status: number): string {
  if (status === 429) {
    return "You're asking RescueMesh too quickly. Please wait a moment and try again.";
  }
  if (status === 503) {
    return "RescueMesh AI is temporarily unavailable. Please try again shortly.";
  }
  if (status === 502) {
    return "RescueMesh AI's knowledge search had a problem. Please try again shortly.";
  }
  if (status === 400) {
    return "Please enter a valid question (up to 500 characters).";
  }
  return "RescueMesh AI couldn't complete that request. Please try again.";
}
