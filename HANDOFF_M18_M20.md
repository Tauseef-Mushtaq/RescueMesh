# HANDOFF_M18_M20.md

## Modules

M18 - Incident Embeddings & Vector Similarity Search
M19 - Similar Incident Retrieval API
M20 - Duplicate Incident Coordinator UI

## Status

Complete.

## What Was Implemented

1. **Database Migration (`supabase/migrations/00000000000005_match_similar_incidents.sql`)**:
   - Created `match_similar_incidents()` RPC function performing pgvector cosine similarity (`1 - (embedding <=> query_embedding)`) over `incidents.embedding`.
   - Supports similarity thresholds, limit capping (max 20), and excluding a target incident ID to prevent self-matching.
   - Restricted execution privileges to `service_role`.

2. **Incident Similarity Utility (`lib/incidents/similarity.ts`)**:
   - `buildIncidentEmbeddingText()`: Formats incident type, summary, and raw report text into an optimized text string for embedding.
   - `findSimilarIncidents()`: Embeds query text if required and executes the `match_similar_incidents` RPC call against Supabase.

3. **Incident Creation Embedding Persistence (`app/api/incidents/route.ts`)**:
   - Updated `POST /api/incidents` to compute a 768-dim Gemini vector embedding for newly reported emergency incidents and persist it directly in `incidents.embedding`.

4. **Similar Incidents API Endpoint (`app/api/similar/route.ts`)**:
   - Created `POST /api/similar`.
   - Rate limited (20 req/min/IP).
   - Validates `incidentId` (UUID) or `queryText` inputs.
   - Returns matched incidents sorted by similarity score with percentage metrics.

5. **Coordinator Duplicate Detection Component (`components/incidents/similar-incidents.tsx` & `app/incidents/[id]/page.tsx`)**:
   - Rendered `SimilarIncidentsSection` on `/incidents/[id]`.
   - Highlights probable duplicates (match >= 75%) with amber badges and direct links for coordinators to inspect related incidents.

## Verification

- `npm run build`: Compiled 13 static/dynamic routes cleanly with 0 TypeScript errors.
- Verified `/api/similar` endpoint validation and rate limiting.
