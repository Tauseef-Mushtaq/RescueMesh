/**
 * Incident Intelligence contract (M14).
 *
 * Server and client share this shape: `lib/incidents/intelligence.ts`
 * (server orchestration, M14-C/D/E) produces it, `app/api/incidents/[id]
 * /intelligence/route.ts` (M14-E) returns it as the `data` field, and
 * `lib/incidents/intelligence-client.ts` (this same part) validates it at
 * runtime before the UI (M14-F) renders it.
 *
 * Deliberately mirrors `lib/rag/client-response.ts`'s `RagSource` /
 * `RagSuccessData` shape rather than inventing a new convention — see
 * HANDOFF_M14A.md's "Existing RAG Architecture" section. The one
 * structural difference from the M13 `/ask` contract is that M14 has no
 * single free-text "answer": Gemini's grounded output is split into
 * `assessment` / `actions` / `watchFor` / `informationGaps` so the UI can
 * keep "AI decision support" clearly separated from "reported incident
 * facts" (Part F), and can render actions/watch-for/gaps as lists rather
 * than a single paragraph a judge has to parse.
 *
 * No fields exist here that the retrieval/generation layer cannot
 * actually produce (no invented confidence scores, no invented URLs — see
 * HANDOFF_M14A.md's "Existing RAG Architecture" note on `RetrievedChunk`
 * only ever carrying `title` / `slug` / `category` metadata).
 */
import type { KnowledgeCategory } from "@/lib/supabase/types";

/**
 * A single retrieved knowledge source backing (part of) the generated
 * guidance. Mirrors `RagSource` in `lib/rag/client-response.ts` exactly —
 * same three fields, same nullability, same meaning. Deliberately does
 * NOT add a URL, author, publication date, agency, or similarity score:
 * none of those are fields the existing `RetrievedChunk` metadata
 * actually carries (see `lib/rag/retrieval.ts`), and inventing them here
 * would violate the "do not fabricate citations" rule in AGENTS.md.
 */
export interface IncidentIntelligenceSource {
  title: string | null;
  slug: string | null;
  category: KnowledgeCategory | null;
}

/**
 * The full M14 decision-support payload for one incident.
 *
 * `knowledgeFound: false` is a first-class, valid state — not an error.
 * When it is false, `assessment` is a short controlled explanatory
 * string (not Gemini output — Gemini is never called in this case, per
 * HANDOFF_M14A's retrieval note), and `actions` / `watchFor` /
 * `informationGaps` / `sources` are all empty arrays rather than
 * containing placeholder text. See "No-Knowledge Contract" below for why
 * this shape was chosen over a separate `status`/discriminated-union
 * type.
 */
export interface IncidentIntelligence {
  incidentId: string;
  knowledgeFound: boolean;
  assessment: string;
  actions: string[];
  watchFor: string[];
  informationGaps: string[];
  sources: IncidentIntelligenceSource[];
}
