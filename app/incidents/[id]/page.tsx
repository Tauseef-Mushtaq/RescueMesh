"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { PageShell } from "@/components/layout/page-shell";
import { IncidentIntelligenceSection } from "@/components/incidents/incident-intelligence";
import { SimilarIncidentsSection } from "@/components/incidents/similar-incidents";
import { LARGE_GROUP_THRESHOLD } from "@/lib/scoring/priority";
import type { IncidentSeverity, IncidentStatus, IncidentType } from "@/lib/supabase/types";

/**
 * Shape returned by GET /api/incidents/[id]. Mirrors the API's camelCase
 * response mapping — see app/api/incidents/[id]/route.ts. priorityScore,
 * severity, and needs are always the persisted, authoritative values;
 * nothing on this page recalculates or replaces them.
 */
interface IncidentDetail {
  id: string;
  reportText: string | null;
  normalizedText: string | null;
  language: string | null;
  incidentType: IncidentType | null;
  summary: string | null;
  latitude: number | null;
  longitude: number | null;
  peopleAffected: number | null;
  childrenCount: number | null;
  elderlyCount: number | null;
  medicalEmergency: boolean;
  mobilityImpairment: boolean;
  immediateDanger: boolean;
  foodShortage: boolean;
  waterRisk: boolean;
  priorityScore: number | null;
  severity: IncidentSeverity | null;
  confidence: number | null;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  needs: { id: string; needType: string; priority: number | null }[];
}

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  flood: "Flood",
  earthquake: "Earthquake",
  fire: "Fire",
  building_collapse: "Building Collapse",
  medical_emergency: "Medical Emergency",
  missing_person: "Missing Person",
  road_blockage: "Road Blockage",
  food_shortage: "Food Shortage",
  shelter_need: "Shelter Need",
  other: "Other",
};

const SEVERITY_BADGE_VARIANT: Record<IncidentSeverity, BadgeVariant> = {
  CRITICAL: "critical",
  HIGH: "high",
  MODERATE: "moderate",
  LOW: "low",
};

type LoadState = "loading" | "loaded" | "not_found" | "error";

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

/**
 * Display-only formatting for a need type. incident_needs.need_type is
 * a free-form persisted string (from reporter-selected options or
 * Gemini extraction) — this never mutates the underlying value, only
 * how it's rendered. snake_case values (e.g. "medical_assistance")
 * become "Medical assistance"; already-readable values pass through
 * with only their first letter capitalized.
 */
function formatNeedType(needType: string): string {
  const spaced = needType.includes("_") ? needType.replace(/_/g, " ") : needType;
  const trimmed = spaced.trim();
  if (!trimmed) return needType;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function BackToDashboard() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
    >
      ← Back to Dashboard
    </Link>
  );
}

function CountRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">
        {value === null ? "Not provided" : value}
      </span>
    </div>
  );
}

interface CriticalIndicator {
  label: string;
  triggered: boolean;
}

function CriticalIndicators({ incident }: { incident: IncidentDetail }) {
  const indicators: CriticalIndicator[] = [
    { label: "Immediate danger", triggered: incident.immediateDanger },
    { label: "Medical emergency", triggered: incident.medicalEmergency },
    { label: "Mobility impairment", triggered: incident.mobilityImpairment },
    { label: "Food shortage", triggered: incident.foodShortage },
    { label: "Water risk", triggered: incident.waterRisk },
  ];

  const triggered = indicators.filter((i) => i.triggered);
  const untriggered = indicators.filter((i) => !i.triggered);

  return (
    <div className="flex flex-col gap-3">
      {triggered.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {triggered.map((indicator) => (
            <Badge key={indicator.label} variant="critical">
              ⚠ {indicator.label}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No critical indicators were flagged for this incident.
        </p>
      )}

      {untriggered.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {untriggered.map((indicator) => (
            <span key={indicator.label}>{indicator.label}: Not indicated</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface ExplanationFactor {
  label: string;
  points: number;
}

/**
 * Derives the triggered M06 factor labels/points directly from the
 * persisted incident fields, using the already-established M06 rules —
 * purely explanatory. This never computes or displays a new score; the
 * persisted priorityScore/severity remain the sole authority.
 */
function getTriggeredFactors(incident: IncidentDetail): ExplanationFactor[] {
  const factors: ExplanationFactor[] = [];
  if (incident.immediateDanger) factors.push({ label: "Immediate danger", points: 25 });
  if ((incident.childrenCount ?? 0) > 0) factors.push({ label: "Children present", points: 20 });
  if (incident.medicalEmergency) factors.push({ label: "Medical emergency", points: 20 });
  if (incident.mobilityImpairment) factors.push({ label: "Mobility impairment", points: 15 });
  if ((incident.elderlyCount ?? 0) > 0) factors.push({ label: "Elderly present", points: 10 });
  if ((incident.peopleAffected ?? 0) >= LARGE_GROUP_THRESHOLD) {
    factors.push({ label: "Large group", points: 10 });
  }
  if (incident.foodShortage) factors.push({ label: "Food shortage", points: 5 });
  return factors;
}

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchIncident = useCallback(async () => {
    if (!id) return;
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/incidents/${id}`, { cache: "no-store" });
      const payload: { success: boolean; data?: IncidentDetail; error?: string } =
        await response.json();

      if (response.status === 404) {
        setLoadState("not_found");
        return;
      }

      if (!response.ok || !payload.success || !payload.data) {
        setErrorMessage(payload.error ?? "Unable to load this incident.");
        setLoadState("error");
        return;
      }

      setIncident(payload.data);
      setLoadState("loaded");
    } catch {
      setErrorMessage("Unable to load this incident.");
      setLoadState("error");
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchIncident();
    });
  }, [fetchIncident]);

  if (loadState === "loading") {
    return (
      <main className="flex flex-1">
        <PageShell>
          <BackToDashboard />
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground" role="status">
              Loading incident…
            </CardContent>
          </Card>
        </PageShell>
      </main>
    );
  }

  if (loadState === "not_found") {
    return (
      <main className="flex flex-1">
        <PageShell>
          <BackToDashboard />
          <Card>
            <CardContent className="flex flex-col gap-3 p-6" role="alert">
              <p className="text-sm text-foreground">Incident not found.</p>
              <BackToDashboard />
            </CardContent>
          </Card>
        </PageShell>
      </main>
    );
  }

  if (loadState === "error" || !incident) {
    return (
      <main className="flex flex-1">
        <PageShell>
          <BackToDashboard />
          <Card>
            <CardContent className="flex flex-col gap-3 p-6" role="alert">
              <p className="text-sm text-foreground">
                {errorMessage ?? "Unable to load this incident."}
              </p>
              <BackToDashboard />
            </CardContent>
          </Card>
        </PageShell>
      </main>
    );
  }

  const triggeredFactors = getTriggeredFactors(incident);
  const hasLocation = incident.latitude !== null && incident.longitude !== null;

  return (
    <main className="flex flex-1">
      <PageShell>
        <BackToDashboard />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">
              {incident.incidentType
                ? INCIDENT_TYPE_LABELS[incident.incidentType]
                : "Uncategorized"}
            </Badge>
            {incident.severity && (
              <Badge variant={SEVERITY_BADGE_VARIANT[incident.severity]}>
                {incident.severity}
              </Badge>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Status:</span>
              <Select
                value={incident.status}
                onChange={async (e) => {
                  const newStatus = e.target.value as IncidentStatus;
                  setIncident((prev) => (prev ? { ...prev, status: newStatus } : null));
                  try {
                    await fetch(`/api/incidents/${incident.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: newStatus }),
                    });
                  } catch {
                    fetchIncident();
                  }
                }}
                className="h-7 py-0 text-xs w-32"
              >
                <option value="NEW">NEW</option>
                <option value="VERIFIED">VERIFIED</option>
                <option value="RESOLVED">RESOLVED</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {incident.priorityScore !== null && (
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                Priority {incident.priorityScore} / 100
              </span>
            )}
            <span className="text-sm text-muted-foreground">
              Reported {formatRelativeTime(incident.createdAt)}
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Situation</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Summary
                  </span>
                  <p className="text-sm text-foreground">
                    {incident.summary ?? "No summary available."}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Original report
                  </span>
                  <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface-elevated p-3 text-sm text-foreground">
                    {incident.reportText ?? "No report text available."}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Affected People</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <CountRow label="People affected" value={incident.peopleAffected} />
                <CountRow label="Children" value={incident.childrenCount} />
                <CountRow label="Elderly" value={incident.elderlyCount} />
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Language</span>
                  <span className="font-medium text-foreground">
                    {incident.language ?? "Not provided"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Important Indicators</CardTitle>
              </CardHeader>
              <CardContent>
                <CriticalIndicators incident={incident} />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Needs</CardTitle>
              </CardHeader>
              <CardContent>
                {incident.needs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No needs recorded for this incident.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {incident.needs.map((need) => (
                      <li
                        key={need.id}
                        className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
                      >
                        <span className="text-foreground">{formatNeedType(need.needType)}</span>
                        {need.priority !== null && (
                          <span className="text-xs text-muted-foreground">
                            Priority {need.priority}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Priority Explanation</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  The persisted priority score and severity are authoritative. This
                  is an explanation of the factors that contributed to them — it is
                  not a recalculation.
                </p>
                {triggeredFactors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No scoring factors were triggered for this incident.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {triggeredFactors.map((factor) => (
                      <li
                        key={factor.label}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="text-foreground">{factor.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          +{factor.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reported Location</CardTitle>
              </CardHeader>
              <CardContent>
                {hasLocation ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="text-foreground">
                      Latitude: {incident.latitude!.toFixed(4)}
                    </span>
                    <span className="text-foreground">
                      Longitude: {incident.longitude!.toFixed(4)}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Location not provided</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <SimilarIncidentsSection
          incidentId={incident.id}
          reportText={incident.reportText}
          summary={incident.summary}
        />

        <IncidentIntelligenceSection incidentId={incident.id} />
      </PageShell>
    </main>
  );
}
