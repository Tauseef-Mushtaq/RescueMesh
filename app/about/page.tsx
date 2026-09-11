import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/layout/section-header";

const PIPELINE_STAGES = [
  "Human report",
  "AI understanding",
  "Structured incident",
  "Deterministic priority",
  "Semantic similarity",
  "RAG retrieval",
  "Evidence-backed recommendation",
  "Map visualization",
  "Human coordinator",
];

const STACK_ROWS: { layer: string; technology: string }[] = [
  { layer: "Application", technology: "Next.js (App Router) + TypeScript" },
  { layer: "Backend", technology: "Next.js Route Handlers / Server Actions" },
  { layer: "Database & vectors", technology: "Supabase PostgreSQL + pgvector" },
  { layer: "Runtime AI", technology: "Gemini API (extraction, embeddings, generation)" },
  { layer: "Maps", technology: "MapLibre / Leaflet + OpenStreetMap" },
  { layer: "Deployment", technology: "Vercel" },
];

const PRIORITY_FACTORS: { factor: string; points: string }[] = [
  { factor: "Immediate danger", points: "+25" },
  { factor: "Children present", points: "+20" },
  { factor: "Medical emergency", points: "+20" },
  { factor: "Mobility impairment", points: "+15" },
  { factor: "Elderly present", points: "+10" },
  { factor: "Large group (10+ people)", points: "+10" },
  { factor: "Food shortage", points: "+5" },
];

const LIMITATIONS = [
  "This is a hackathon prototype, not a certified emergency dispatch system. It does not contact rescue services or guarantee any response.",
  "AI extraction and RAG-grounded recommendations are decision support only — they are never a substitute for a trained emergency professional's judgment.",
  "The system does not provide medical diagnosis or treatment instructions.",
  "When the knowledge base has no relevant, retrievable evidence for a question, the system says so explicitly rather than generating an unsupported answer.",
  "Duplicate-incident suggestions are advisory. A coordinator must review and confirm before any incident is marked resolved as a duplicate — nothing merges automatically.",
  "The core build runs entirely on free-tier services (Supabase, Gemini, Vercel Hobby, OpenStreetMap) and has known rate/quota limits under free tiers.",
];

export default function AboutPage() {
  return (
    <main className="flex flex-1">
      <PageShell className="max-w-4xl">
        <SectionHeader
          title="About RescueMesh AI"
          description="Architecture, technology choices, and the limitations of this prototype."
        />

        <Card>
          <CardHeader>
            <CardTitle>What RescueMesh AI does</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-foreground">
            <p>
              RescueMesh AI turns chaotic, multilingual emergency reports — English,
              Urdu, and Roman Urdu — into structured, prioritized, evidence-backed
              rescue intelligence for a human coordinator to review. It does not
              replace rescuers; it helps them see the right information first.
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-elevated p-3">
              {PIPELINE_STAGES.map((stage, i) => (
                <span key={stage} className="flex items-center gap-2">
                  <Badge variant="info">{stage}</Badge>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <span aria-hidden="true" className="text-muted-foreground">
                      →
                    </span>
                  )}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Technical architecture</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y divide-border">
              {STACK_ROWS.map((row) => (
                <div
                  key={row.layer}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{row.layer}</span>
                  <span className="font-medium text-foreground text-right">
                    {row.technology}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How the priority score works</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">
              Priority is calculated deterministically from structured incident
              fields — never guessed by the AI model itself. The same structured
              data always produces the same score.
            </p>
            <div className="flex flex-col divide-y divide-border">
              {PRIORITY_FACTORS.map((row) => (
                <div
                  key={row.factor}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <span className="text-foreground">{row.factor}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.points}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Normalized score: 80–100 Critical · 60–79 High · 40–59 Moderate ·
              0–39 Low.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limitations & responsible use</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm text-foreground">
              {LIMITATIONS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted-foreground">
                    •
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Questions or feedback? Return to the{" "}
          <Link href="/dashboard" className="text-cyan-500 hover:underline">
            coordinator dashboard
          </Link>{" "}
          or{" "}
          <Link href="/report" className="text-cyan-500 hover:underline">
            submit a report
          </Link>
          .
        </p>
      </PageShell>
    </main>
  );
}
