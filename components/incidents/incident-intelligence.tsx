"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fallbackErrorForStatus,
  isIncidentIntelligenceData,
} from "@/lib/incidents/intelligence-client";
import type {
  IncidentIntelligence,
  IncidentIntelligenceSource,
} from "@/lib/incidents/intelligence-types";
import type { KnowledgeCategory } from "@/lib/supabase/types";

/**
 * Incident Intelligence (M14-G).
 *
 * A self-contained, additive section for the existing incident detail
 * page (`app/incidents/[id]/page.tsx`) — it does not read or touch that
 * page's authoritative incident data (priority/severity/status/type),
 * and that page does not need to know anything about this component's
 * internal state.
 *
 * Data flow (never changes, per HANDOFF_M14A–F.md):
 *   user clicks "Analyze Incident"
 *     -> POST /api/incidents/[id]/intelligence  (M14-F, no request body)
 *     -> M14-C/D/E pipeline server-side
 *     -> IncidentIntelligence
 *     -> rendered here
 *
 * This component never imports `createServiceClient`, `@google/genai`,
 * or any server-only module — it only calls `fetch` against the M14-F
 * route, exactly like `app/ask/page.tsx` (M13) calls `/api/rag`.
 *
 * No `useEffect` anywhere in this file — the only trigger for the POST
 * is the button's `onClick`. No automatic/background/on-mount analysis.
 */

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

const DISCLAIMER =
  "Advisory guidance based on the incident report and verified RescueMesh knowledge. Use professional emergency services and local authority guidance where appropriate.";

type Status = "idle" | "loading" | "success" | "error";

export interface IncidentIntelligenceSectionProps {
  incidentId: string;
}

function SourceList({ sources }: { sources: IncidentIntelligenceSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-foreground">
        Verified knowledge sources
        <span className="ml-2 font-normal text-muted-foreground">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </h4>

      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((source, index) => {
          // Never invent a title: only render text the API actually
          // returned. If neither a title nor a category is available,
          // fall back to a generic, non-specific UI label rather than a
          // fabricated document name.
          const hasTitle = Boolean(source.title);
          const hasCategory = Boolean(source.category);

          return (
            <Card key={`${source.slug ?? source.title ?? "source"}-${index}`}>
              <CardContent className="flex flex-col gap-2 p-4">
                <p className="text-sm font-medium text-foreground">
                  {hasTitle
                    ? source.title
                    : hasCategory
                      ? CATEGORY_LABELS[source.category as KnowledgeCategory]
                      : "Verified knowledge source"}
                </p>
                {hasCategory && hasTitle && (
                  <Badge variant="default" className="w-fit">
                    {CATEGORY_LABELS[source.category as KnowledgeCategory]}
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function IntelligenceList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <li
            key={index}
            className="flex gap-2 text-sm text-foreground before:mt-2 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-muted-foreground"
          >
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IncidentIntelligenceSection({
  incidentId,
}: IncidentIntelligenceSectionProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<IncidentIntelligence | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Belt-and-suspenders double-submit guard (same pattern as
  // app/ask/page.tsx, M13) — a ref survives even a rapid double-click
  // before React re-renders the disabled button.
  const submittingRef = useRef(false);

  async function analyze() {
    if (submittingRef.current) return;
    submittingRef.current = true;

    setStatus("loading");
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/incidents/${incidentId}/intelligence`, {
        method: "POST",
      });

      let payload: { success?: boolean; data?: unknown; error?: string };
      try {
        payload = await response.json();
      } catch {
        setErrorMessage(
          "RescueMesh AI sent back a response we couldn't understand. Please try again."
        );
        setStatus("error");
        return;
      }

      if (!response.ok || payload.success !== true) {
        setErrorMessage(payload.error ?? fallbackErrorForStatus(response.status));
        setStatus("error");
        return;
      }

      if (!isIncidentIntelligenceData(payload.data)) {
        setErrorMessage(
          "RescueMesh AI sent back a response we couldn't understand. Please try again."
        );
        setStatus("error");
        return;
      }

      setResult(payload.data);
      setStatus("success");
    } catch {
      setErrorMessage("Couldn't reach RescueMesh AI. Check your connection and try again.");
      setStatus("error");
    } finally {
      submittingRef.current = false;
    }
  }

  const isLoading = status === "loading";
  const hasAttempted = status === "success" || status === "error";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Incident Intelligence</CardTitle>
            <Badge variant="info">AI-assisted guidance</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={analyze}
          disabled={isLoading}
          aria-busy={isLoading}
          className="w-fit shrink-0"
        >
          {isLoading ? "Analyzing incident…" : hasAttempted ? "Analyze Again" : "Analyze Incident"}
        </Button>
      </CardHeader>

      <CardContent aria-live="polite" className="flex flex-col gap-5">
        {isLoading && (
          <div
            className="flex items-center gap-3 text-sm text-muted-foreground"
            role="status"
          >
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent"
              aria-hidden="true"
            />
            Reviewing the incident against verified RescueMesh knowledge…
          </div>
        )}

        {status === "error" && errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}

        {status === "success" && result && result.knowledgeFound && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Assessment
              </span>
              <p className="text-sm text-foreground">{result.assessment}</p>
            </div>

            <IntelligenceList title="Recommended actions" items={result.actions} />
            <IntelligenceList title="Watch for" items={result.watchFor} />
            <IntelligenceList title="Information gaps" items={result.informationGaps} />

            <SourceList sources={result.sources} />
          </>
        )}

        {status === "success" && result && !result.knowledgeFound && (
          <div className="flex flex-col gap-2">
            <Badge variant="warning" className="w-fit">
              No verified knowledge found
            </Badge>
            <p className="text-sm text-foreground">{result.assessment}</p>
          </div>
        )}

        {status === "idle" && (
          <p className="text-sm text-muted-foreground">
            Press &ldquo;Analyze Incident&rdquo; to generate advisory guidance from this
            incident&apos;s reported facts and RescueMesh&apos;s verified knowledge base.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
