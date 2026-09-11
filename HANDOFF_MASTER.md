# RescueMesh AI — Complete Master Project Handoff Document

---

## 1. Project Overview & Executive Summary

**RescueMesh AI** is an AI-powered disaster intelligence and emergency coordination platform designed for high-stakes emergency management. It transforms unstructured, chaotic, multilingual emergency reports (English, Urdu, Roman Urdu) into structured, prioritized rescue intelligence for emergency dispatch teams and disaster coordinators.

### Key Value Proposition
- **AI Language & Report Processing**: Multilingual NLP extraction (Gemini + Groq fallback) extracts disaster types, affected counts, and vulnerability signals.
- **Deterministic Priority Scoring**: Risk scores are calculated deterministically via code rules (not raw LLM outputs), guaranteeing predictable priority rankings.
- **Curated RAG Knowledge Base**: Uses Gemini embeddings (`text-embedding-004`) + Supabase `pgvector` to retrieve verified emergency protocols (UN OCHA, NDMA, WHO, IFRC).
- **Interactive Operations Command Center**: Live disaster map, trend analytics, full incident filtering, visual evidence inspector, and reporter direct dispatch channel.

---

## 2. Technology Stack & Architecture

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling & System**: Tailwind CSS v4 + Navy Ocean Dark & Emergency Crimson Alert design tokens
- **Database & Storage**: Supabase PostgreSQL + `pgvector` extension + Supabase Storage (`incident-evidence` bucket)
- **Primary AI Provider**: `@google/genai` (Gemini API free tier)
- **Fallback AI Provider**: Groq API (`llama-3.3-70b-versatile` via REST)
- **Map Library**: MapLibre GL JS + OpenFreeMap (`liberty` style)
- **Analytics & Icons**: `recharts` + `lucide-react`

---

## 3. Application Routes & Functionality

| Route | Purpose & Key Features |
|---|---|
| `/` | **Cinematic Landing Page** — 9 sections detailing problem, live demo link, architecture, and emergency AI workflow. |
| `/dashboard` | **Command Center** — Real-time KPI stat cards, 7-day incident trend chart, severity donut chart, incident type distribution, "Needs Attention" panel, and interactive map. |
| `/incidents` | **Operations Feed** | Multi-filter search (severity, status, type), pagination, quick detail view, and direct priority score badges. |
| `/incidents/[id]` | **Incident Intelligence Detail** — Full report breakdown, priority scoring rationale, GPS map preview, **📸 Visual Evidence Inspector**, **📞 Reporter Direct Dispatch Channel**, and AI RAG Advisory briefing button. |
| `/map` | **Live Disaster Map** | Full-viewport interactive map with severity-coded pulsating markers, quick popup previews, and filter controls. |
| `/report` | **Emergency Report Submission** | Multilingual form, **📍 One-click "Use My Current Location" (Browser Geolocation)**, reporter contact fields, **📸 Visual Evidence File Upload**, and real-time processing indicator. |
| `/ask` | **Ask RescueMesh AI (RAG)** | Grounded Q&A interface against curated UN OCHA/NDMA guidelines with cited source badges. |
| `/knowledge` | **Knowledge Center** | Browsable repository of 23+ curated disaster response protocols with category pills, full-text search, and pgvector stats. |
| `/about` | **About & System Limits** | Technical stack overview, priority scoring math, safety disclaimers, and data privacy policies. |

---

## 4. Complete Database Schema & Migrations

All SQL migration files are located in `supabase/migrations/`:

```
supabase/migrations/
├── 00000000000001_initial_schema.sql         # Core tables (incidents, incident_needs) & pgvector
├── 00000000000002_grant_service_role.sql     # RLS policies & service role permissions
├── 00000000000003_knowledge_documents.sql    # Curated knowledge documents table
├── 00000000000004_rag_foundation.sql         # Knowledge chunks, sources & match_knowledge_chunks RPC
├── 00000000000005_match_similar_incidents.sql # Incident vector similarity search RPC
└── 00000000000006_add_reporter_contact_columns.sql # Reporter contact, image_url & storage bucket
```

### Complete SQL Script to Execute in Supabase SQL Editor
If initializing a new Supabase project, execute `00000000000001` through `00000000000005`, then run:

```sql
-- Migration 00000000000006: Contact info, evidence image, and storage bucket
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

## 5. Environment Variables Configuration

Create a `.env` file in the project root:

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

## 6. How to Deploy to Vercel

1. Push your repository to GitHub.
2. Log into [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your RescueMesh repository.
4. Select **Next.js** as the Framework Preset.
5. Add all environment variables listed in Section 5 above under **Environment Variables**.
6. Click **Deploy**.

---

## 7. Verification & Health Check

The repository has been fully built and verified locally:
- **TypeScript Type Check**: `npx tsc --noEmit` -> **Exit Code 0 (0 errors)**
- **Next.js Production Build**: `npm run build` -> **All 18 routes compiled successfully**
