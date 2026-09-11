# RescueMesh AI — Comprehensive Complete Project Handoff

---

## 1. Project Identity & Architecture Overview

**RescueMesh AI** is an AI-powered disaster intelligence and emergency coordination platform designed to process chaotic, unstructured, multilingual emergency reports into structured, prioritized rescue intelligence for emergency dispatch teams and disaster response coordinators.

### Core System Guiding Principle (AGENTS.md)
> **AI Proposes; Deterministic Code Decides.**
> AI (Gemini / Groq) is responsible for language understanding, incident extraction, summarization, and RAG advisory generation.
> Application code is strictly responsible for deterministic priority scoring, schema validation, persistence, similarity thresholding, status management, and authorization.

---

## 2. Technology Stack & Key Libraries

- **Framework**: Next.js 16.3.4 (App Router) + TypeScript + Node.js (npm only)
- **Styling Tokens**: Tailwind CSS 4 (`globals.css`) with Navy Ocean Dark (`:root`) and Institutional Light (`html.light`) theme tokens + Emergency Crimson Red primary brand system (`#EF4444` / `#DC2626`).
- **Database & Vector Search**: Supabase PostgreSQL + `pgvector` extension (768-dimensional embeddings).
- **Storage**: Supabase Storage (`incident-evidence` public bucket for visual evidence upload).
- **Primary AI Provider**: `@google/genai` (Gemini API free tier: `gemini-2.5-flash` -> `gemini-2.0-flash` -> `gemini-1.5-flash`).
- **Fallback AI Provider**: Groq API (`llama-3.3-70b-versatile` via REST) when Gemini is rate-limited or unavailable.
- **Mapping Engine**: MapLibre GL JS + OpenFreeMap (`liberty` vector tile style).
- **Analytics & Icons**: `recharts` (AreaChart, PieChart donut, horizontal BarChart) + `lucide-react`.

---

## 3. Modular Feature Matrix (Modules M00 – M35 + UI/UX Redesign)

| Module | Feature / Component | Key Capability |
|---|---|---|
| **M00–M03** | Core Architecture & Token System | Next.js App Router, Supabase client/server setup, CSS variable token system. |
| **M04–M05** | Multilingual Report Extraction | Extracts disaster type, affected count, vulnerability flags from English, Urdu, Roman Urdu using Gemini/Groq. |
| **M06** | Deterministic Priority Engine | Mathematical score calculation (0–100) based on weighted risk factors (life danger +25, children +20, medical +20, mobility +15, elderly +10, large group +10, food +5). |
| **M07–M10** | Incident Persistence & API Routes | `POST /api/incidents`, `GET /api/incidents`, `GET /api/incidents/[id]`, status update pipeline. |
| **M11–M12** | Curated Knowledge Foundation & RAG | 23+ authoritative UN OCHA/NDMA guidelines chunked and embedded into 768-D vectors. |
| **M13–M14** | Ask RAG & Structured Intelligence | `POST /api/rag` (grounded Q&A with citations) and `POST /api/incidents/[id]/intelligence` (advisory generator). |
| **M15–M18** | Incident Similarity & Map Engine | Vector similarity search (`match_similar_incidents` RPC) for duplicate detection & MapLibre map integration. |
| **UI/UX** | Master UI Redesign | Collapsible sidebar, top navbar, mobile bottom nav, 3 Recharts analytics components, Theme toggle. |
| **UX Polish** | Emergency UX Enhancements | **🚨 Floating Emergency FAB**, **📍 GPS Geolocation ("Use My Current Location")**, **📸 Visual Evidence Upload & Storage**, and **📞 Reporter Contact Direct Dispatch Channel**. |

---

## 4. Application Routes Overview

```
app/
├── page.tsx                      # 9-Section Cinematic Hero Landing Page
├── dashboard/page.tsx            # Operations Command Center (KPI Cards, 3 Recharts, Map, Needs Attention)
├── incidents/
│   ├── page.tsx                  # Operations List Page (Multi-filter search, pagination, status badges)
│   └── [id]/page.tsx             # Incident Detail Page (Summary, GPS Map, Visual Evidence, Direct Contact, RAG Briefing)
├── map/page.tsx                  # Full-Viewport Live Map Page
├── report/page.tsx               # Emergency Report Form (GPS Geolocation, Image Upload, Contact Info)
├── ask/page.tsx                  # Ask RescueMesh AI (Grounded RAG Q&A with citations)
├── knowledge/page.tsx            # Knowledge Center (Curated UN OCHA/NDMA docs, search, stats)
└── about/page.tsx                # Technical Stack, Priority Scoring Formulas, Safety Disclaimers
```

---

## 5. Complete Database Schema & Migrations

All SQL migration scripts are located in `supabase/migrations/`:

```
supabase/migrations/
├── 00000000000001_initial_schema.sql         # Base incidents table, incident_needs, pgvector(768)
├── 00000000000002_grant_service_role.sql     # RLS policies & service_role permissions
├── 00000000000003_knowledge_documents.sql    # Curated knowledge_documents table
├── 00000000000004_rag_foundation.sql         # knowledge_sources, knowledge_chunks, match_knowledge_chunks RPC
├── 00000000000005_match_similar_incidents.sql # Cosine similarity duplicate incident detection RPC
└── 00000000000006_add_reporter_contact_columns.sql # reporter_name, reporter_contact, image_url, storage bucket
```

### Consolidated SQL Migration Query for Supabase SQL Editor
To configure a fresh Supabase database, execute migrations `00000000000001` through `00000000000005`, followed by:

```sql
-- Migration 00000000000006: Add contact columns, image_url, and storage bucket
ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS reporter_name text,
ADD COLUMN IF NOT EXISTS reporter_contact text,
ADD COLUMN IF NOT EXISTS image_url text;

-- Create public storage bucket for disaster evidence photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-evidence', 'incident-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for public upload and read
CREATE POLICY "Public Incident Evidence Upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'incident-evidence');

CREATE POLICY "Public Incident Evidence Read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'incident-evidence');
```

---

## 6. Environment Variables Configuration (`.env`)

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Primary AI Provider (Gemini API Free Tier)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODEL=gemini-2.0-flash
GEMINI_SECONDARY_FALLBACK_MODEL=gemini-1.5-flash

# Fallback AI Provider (Groq API)
GROQ_API_KEY=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
GROQ_MODEL=llama-3.3-70b-versatile

# RAG Ingestion Protection Secret
RAG_INGEST_SECRET=your-custom-rag-secret
```

---

## 7. Deployment Instructions (Vercel)

1. Push the code repository to GitHub.
2. Go to [Vercel](https://vercel.com) -> **Add New Project** -> Import repository.
3. Set Framework Preset to **Next.js**.
4. Configure all environment variables from Section 6 in the Vercel dashboard.
5. Click **Deploy**.

---

## 8. Final Verification Status

- **TypeScript Type Check**: `npx tsc --noEmit` -> **Passed with 0 errors (`exit code 0`)**
- **Production Build**: `npm run build` -> **All 18 routes compiled successfully**
