# ARCHITECTURE.md — RescueMesh AI

Planned architecture only. Nothing here is implemented yet as of M00 — later modules build these pieces incrementally.

## System Layout

```
Next.js (App Router)
 ├── UI (app/ pages + components/)
 ├── Server Components
 ├── Route Handlers / Server Actions (app/api/*)
 ├── AI layer          (lib/ai)
 ├── RAG layer          (lib/rag)
 ├── Embedding layer    (lib/embeddings)
 ├── Scoring layer       (lib/scoring)
 └── Supabase
       ├── PostgreSQL
       ├── pgvector
       └── Auth
```

## Runtime Choices

- Next.js App Router, Node.js runtime.
- npm as the only package manager.
- Route Handlers / Server Actions for all backend operations.
- No separate Express service.
- No microservices for MVP.

## High-Level Data Flow

```
Emergency Report
      ↓
AI Understanding (Gemini)
      ↓
Structured Incident (validated)
      ↓
Deterministic Priority (app logic)
      ↓
Database (Supabase Postgres)
      ↓
Coordinator Dashboard
      ↓
Map + Incident Detail
      ↓
RAG / Similarity Intelligence (pgvector)
```

## Planned Directory Structure

```
rescuemesh/
  app/
    page.tsx
    report/page.tsx
    dashboard/page.tsx
    incidents/[id]/page.tsx
    knowledge/page.tsx
    about/page.tsx
    api/
      incidents/
      analyze/
      rag/
      similar/
  components/
    dashboard/
    incident/
    map/
    evidence/
    ui/
  lib/
    ai/
    rag/
    embeddings/
    scoring/
    supabase/
    validation/
  data/
    knowledge/
    demo-incidents/
  supabase/
    migrations/
```

## Data Model (target)

| Table | Purpose |
|---|---|
| `incidents` | Core emergency record — report text, normalized text, language, type, summary, lat/lng, people/children/elderly counts, danger flags, priority score, severity, confidence, status, embedding, timestamps |
| `incident_needs` | Normalized assistance requirements per incident |
| `knowledge_sources` | Source-level metadata for RAG knowledge base. As of M12, one row per ingested `knowledge_documents` row (`knowledge_document_id`, `content_hash` added by migration 00000000000004) |
| `knowledge_chunks` | RAG retrieval units (content, embedding, metadata). As of M12, populated by `lib/rag/ingest.ts`; searched via the `match_knowledge_chunks` SQL function (pgvector cosine similarity) |
| `knowledge_documents` | Curated, whole-article disaster-safety knowledge (M11) — filterable by category/language/published; separate from the chunked RAG tables above, which remain reserved for a future embeddings/retrieval module |
| `incident_evidence` | Evidence-to-source mapping with confidence |

## API Contract (target)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/incidents` | POST | Create incident, trigger analysis pipeline |
| `/api/incidents` | GET | Retrieve incident list |
| `/api/incidents/[id]` | GET | Retrieve single incident + intelligence |
| `/api/incidents/[id]` | PATCH | Update status/coordinator-editable fields |
| `/api/analyze` | POST | Run AI extraction on report text |
| `/api/knowledge` | GET | Retrieve curated, published knowledge documents (M11); filterable by category/language |
| `/api/rag` | POST | (M12) Embed query -> vector similarity search -> grounded Gemini generation -> answer + source attribution |
| `/api/rag/ingest` | POST | (M12) Chunk + embed all published `knowledge_documents` into `knowledge_sources`/`knowledge_chunks`; protected by a shared secret header, not for public/UI use |
| `/api/similar` | POST | Retrieve semantically similar incidents |

This document is updated only when architectural decisions change — not on every module.
