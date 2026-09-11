"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Database,
  Layers,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/layout/section-header";
import type { KnowledgeCategory } from "@/lib/supabase/types";

interface KnowledgeDoc {
  id: string;
  title: string;
  slug: string;
  category: KnowledgeCategory;
  summary: string;
  content: string;
  source: string | null;
  language: string;
  createdAt: string;
}

const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  flood: "Flood",
  earthquake: "Earthquake",
  fire: "Fire",
  building_collapse: "Building Collapse",
  medical_emergency: "Medical Emergency",
  missing_person: "Missing Person",
  road_blockage: "Road Blockage",
  food_shortage: "Food Shortage",
  shelter_need: "Shelter Need",
  general: "General",
};

const CATEGORY_COLORS: Record<KnowledgeCategory, string> = {
  flood: "info",
  earthquake: "warning",
  fire: "critical",
  building_collapse: "high",
  medical_emergency: "critical",
  missing_person: "warning",
  road_blockage: "moderate",
  food_shortage: "high",
  shelter_need: "moderate",
  general: "default",
} as const;

function DocCard({ doc }: { doc: KnowledgeDoc }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="hover:border-primary/40 transition-all">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg bg-primary-soft text-primary">
              <BookOpen size={14} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground leading-tight">
                {doc.title}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <Badge variant={CATEGORY_COLORS[doc.category] as any} className="text-[10px]">
                  {CATEGORY_LABELS[doc.category]}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{doc.language}</span>
                {doc.source && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                    · {doc.source}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-3 space-y-2">
        <p className="text-xs text-muted-foreground leading-relaxed">{doc.summary}</p>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
              {doc.content}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/knowledge", { cache: "no-store" });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setDocs(json.data);
        } else {
          setError(json.error ?? "Failed to load knowledge documents.");
        }
      } catch {
        setError("Unable to connect to the knowledge base.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = docs.filter((doc) => {
    if (categoryFilter !== "ALL" && doc.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !doc.title.toLowerCase().includes(q) &&
        !doc.summary.toLowerCase().includes(q) &&
        !doc.content.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // Build category breakdown counts
  const categoryCounts = docs.reduce<Partial<Record<KnowledgeCategory, number>>>(
    (acc, doc) => {
      acc[doc.category] = (acc[doc.category] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <main className="flex flex-1">
      <PageShell>
        <SectionHeader
          title="Knowledge Center"
          description="Curated disaster-response protocols from authoritative organizations (UN OCHA, NDMA, WHO, IFRC)."
        />

        {/* Stat Cards */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card className="border-border/80 bg-surface">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary-soft text-primary">
                  <BookOpen size={16} />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">{docs.length}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Knowledge Documents
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-surface">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary/20 text-secondary">
                  <Layers size={16} />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">
                    {Object.keys(categoryCounts).length}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Disaster Categories
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-surface col-span-2 sm:col-span-1">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/20 text-success">
                  <Database size={16} />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">768-D</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    pgvector Embeddings
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Category breakdown pills */}
        {!loading && !error && docs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(Object.entries(categoryCounts) as [KnowledgeCategory, number][]).map(
              ([cat, count]) => (
                <button
                  key={cat}
                  onClick={() =>
                    setCategoryFilter((prev) => (prev === cat ? "ALL" : cat))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    categoryFilter === cat
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                  <span className="opacity-70">{count}</span>
                </button>
              )
            )}
            {categoryFilter !== "ALL" && (
              <button
                onClick={() => setCategoryFilter("ALL")}
                className="px-3 py-1 rounded-full text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-all"
              >
                Clear filter ×
              </button>
            )}
          </div>
        )}

        {/* Search */}
        {!loading && !error && docs.length > 0 && (
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search documents by title, summary, or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs"
            />
          </div>
        )}

        {/* Status line */}
        {!loading && !error && (
          <p className="text-xs text-muted-foreground px-1">
            Showing <strong className="text-foreground">{filtered.length}</strong> of{" "}
            {docs.length} documents
          </p>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl skeleton" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <Card className="border-danger/40 bg-danger/5">
            <CardContent className="p-5 text-sm text-danger" role="alert">
              {error}
            </CardContent>
          </Card>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <Card>
            <CardContent className="p-6 text-xs text-muted-foreground">
              {docs.length === 0
                ? "No knowledge documents have been ingested yet. Run POST /api/rag/ingest to populate the knowledge base."
                : "No documents match your search or filter."}
            </CardContent>
          </Card>
        )}

        {/* Document list */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((doc) => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}

        {/* RAG info footer */}
        {!loading && !error && docs.length > 0 && (
          <Card className="border-border/60 bg-surface-elevated/50">
            <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">How the Knowledge Base powers RescueMesh AI</p>
              <p>
                Each document is split into overlapping chunks, embedded into 768-dimensional
                vectors using Gemini, and stored in Supabase pgvector. When an incident is
                analyzed, the most semantically relevant chunks are retrieved and used to ground
                AI recommendations in verified emergency protocols.
              </p>
              <p className="pt-1">
                To add documents, ingest them via{" "}
                <code className="bg-surface rounded px-1 py-0.5 font-mono">
                  POST /api/rag/ingest
                </code>{" "}
                (requires the{" "}
                <code className="bg-surface rounded px-1 py-0.5 font-mono">
                  RAG_INGEST_SECRET
                </code>{" "}
                header).
              </p>
            </CardContent>
          </Card>
        )}
      </PageShell>
    </main>
  );
}
