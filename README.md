# RescueMesh AI

> **Intelligent Disaster Response & Emergency Coordination Platform**  
> Turn chaotic multilingual emergency reports into prioritized, geographically organized, evidence-backed rescue intelligence.

---

## Overview

RescueMesh AI helps emergency response coordinators digest chaotic, multi-lingual emergency reports during natural disasters. It accepts natural-language reports in **English**, **Urdu (اردو)**, and **Roman Urdu**, converts them into structured incident records via Gemini AI, computes a **100% deterministic priority score**, performs **pgvector Retrieval-Augmented Generation (RAG)** for verified emergency guidance, and detects **semantic duplicate reports**.

---

## Features

- 🚑 **Multilingual Emergency Reporting (`/report`)**: Accepts raw descriptions, automatic/manual coordinates, affected counts, and vulnerability indicators in English, Urdu, and Roman Urdu.
- 🎯 **Deterministic Priority Scoring Engine**: Computes scores (0–100) and severity levels (`CRITICAL`, `HIGH`, `MODERATE`, `LOW`) based on explicit risk factors (Immediate Danger +25, Medical +20, Children +20, Mobility Impairment +15, etc.).
- 🗺️ **Coordinator Command Center (`/dashboard`)**: Real-time metrics overview, severity/status filtering, interactive Leaflet disaster map, and prioritized incident feeds.
- 📚 **Grounded Knowledge Retrieval (`/ask`)**: Ask the verified emergency response knowledge base directly to get grounded recommendations cited with authoritative sources.
- 🔍 **Incident Intelligence & Similarity (`/incidents/[id]`)**: On-demand AI assessment citing specific knowledge sources, coupled with pgvector similarity detection (identifying probable duplicate reports >= 75% match).
- ⚡ **1-Click Demo Disaster Simulation (`/api/demo/seed`)**: Pre-loaded multi-lingual emergency scenarios for live presentation without consuming live Gemini quota.

---

## Tech Stack & Architecture

- **Framework**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **Backend & APIs**: Next.js Server Actions & Route Handlers
- **Database & Vectors**: Supabase PostgreSQL + `pgvector` (`vector(768)`)
- **AI & Embeddings**: `@google/genai` (Gemini API Free Tier, `gemini-embedding-001`)
- **Mapping**: MapLibre / Leaflet + OpenStreetMap
- **Cost**: **$0 MVP Target** (using open-source packages & free tiers only)

---

## Environment Setup

Create a `.env.local` file in the project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Gemini AI API Configuration
GEMINI_API_KEY=your-gemini-api-key

# Optional Model Overrides
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
RAG_INGEST_SECRET=your-custom-ingest-secret
```

---

## Supabase Database Migrations

Apply the migrations located in `supabase/migrations/` in numerical order using the Supabase CLI or SQL Editor:

1. `00000000000001_initial_schema.sql` — Base tables (`incidents`, `incident_needs`, `knowledge_sources`, `knowledge_chunks`)
2. `00000000000002_grant_service_role.sql` — Service-role permissions setup
3. `00000000000003_knowledge_documents.sql` — Curated disaster guidance documents
4. `00000000000004_rag_foundation.sql` — `match_knowledge_chunks` pgvector RPC function
5. `00000000000005_match_similar_incidents.sql` — `match_similar_incidents` pgvector RPC function

---

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

3. **Ingest Knowledge Base**:
   To seed and embed the curated emergency knowledge base:
   ```bash
   curl -X POST http://localhost:3000/api/rag/ingest \
     -H "x-ingest-secret: your-custom-ingest-secret"
   ```

4. **Load Demo Disaster Scenario**:
   In the Coordinator Dashboard (`/dashboard`), click **"Load Demo Disaster"** to populate sample emergency reports.

5. **Build for Production**:
   ```bash
   npm run build
   ```

---

## Responsible AI Disclaimer

RescueMesh AI is a decision-support prototype built for emergency coordinators. It does **NOT** dispatch emergency responders automatically, substitute for official emergency services, or provide medical diagnoses. Humans remain responsible for all rescue decisions.
