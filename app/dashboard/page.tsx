"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { IncidentMap } from "@/components/map/incident-map";
import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/layout/section-header";
import type { IncidentSeverity, IncidentStatus, IncidentType } from "@/lib/supabase/types";

/**
 * Shape returned by GET /api/incidents. Mirrors the API's camelCase
 * response mapping — see app/api/incidents/route.ts. priorityScore and
 * severity are always server-computed and displayed as-is; nothing on
 * this page recalculates them.
 */
interface DashboardIncident {
  id: string;
  incidentType: IncidentType | null;
  summary: string | null;
  language: string | null;
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
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
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

const SEVERITY_DOT: Record<IncidentSeverity, string> = {
  CRITICAL: "🔴",
  HIGH: "🟠",
  MODERATE: "🟡",
  LOW: "🟢",
};

type SeverityFilter = "ALL" | IncidentSeverity;
type StatusFilter = "ALL" | IncidentStatus;
type TypeFilter = "ALL" | IncidentType;

type LoadState = "loading" | "loaded" | "error";

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

function MetricCard({
  label,
  value,
  accentClassName,
}: {
  label: string;
  value: number;
  accentClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4 sm:p-5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={`text-3xl font-semibold tabular-nums ${accentClassName ?? "text-foreground"}`}>
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function IndicatorBadges({ incident }: { incident: DashboardIncident }) {
  const indicators: string[] = [];
  if (incident.immediateDanger) indicators.push("Immediate danger");
  if ((incident.childrenCount ?? 0) > 0) indicators.push("Children");
  if ((incident.elderlyCount ?? 0) > 0) indicators.push("Elderly");
  if (incident.medicalEmergency) indicators.push("Medical");
  if (incident.mobilityImpairment) indicators.push("Mobility impairment");

  if (indicators.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {indicators.map((indicator) => (
        <Badge key={indicator} variant="default" className="text-[11px]">
          {indicator}
        </Badge>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<DashboardIncident[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const fetchIncidents = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/incidents", { cache: "no-store" });
      const payload: { success: boolean; data?: DashboardIncident[]; error?: string } =
        await response.json();

      if (!response.ok || !payload.success || !payload.data) {
        setErrorMessage(payload.error ?? "Unable to load incidents.");
        setLoadState("error");
        return;
      }

      setIncidents(payload.data);
      setLoadState("loaded");
    } catch {
      setErrorMessage("Unable to load incidents.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // Deferred via queueMicrotask so the effect body itself never calls
    // setState synchronously (avoids cascading-render lint warnings) —
    // fetchIncidents' own internal setState calls are all inside async
    // continuations, which is fine.
    queueMicrotask(() => {
      fetchIncidents();
    });
  }, [fetchIncidents]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      if (severityFilter !== "ALL" && incident.severity !== severityFilter) return false;
      if (statusFilter !== "ALL" && incident.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && incident.incidentType !== typeFilter) return false;
      return true;
    });
  }, [incidents, severityFilter, statusFilter, typeFilter]);

  const metrics = useMemo(() => {
    return {
      critical: incidents.filter((i) => i.severity === "CRITICAL").length,
      high: incidents.filter((i) => i.severity === "HIGH").length,
      moderate: incidents.filter((i) => i.severity === "MODERATE").length,
      total: incidents.length,
    };
  }, [incidents]);

  return (
    <main className="flex flex-1">
      <PageShell>
        <SectionHeader
          title="RescueMesh Command Center"
          description="Live emergency intelligence, ordered by newest report."
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setLoadState("loading");
                  try {
                    await fetch("/api/demo/seed", { method: "POST" });
                    await fetchIncidents();
                  } catch {
                    fetchIncidents();
                  }
                }}
                disabled={loadState === "loading"}
              >
                Load Demo Disaster
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={fetchIncidents}
                disabled={loadState === "loading"}
              >
                {loadState === "loading" ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard label="Critical" value={metrics.critical} accentClassName="text-critical" />
          <MetricCard label="High" value={metrics.high} accentClassName="text-high" />
          <MetricCard label="Moderate" value={metrics.moderate} accentClassName="text-moderate" />
          <MetricCard label="Total" value={metrics.total} />
        </div>

        {/* Severity Distribution Visualization Bar */}
        <Card className="p-4 border-border/60 bg-surface/50 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span>Severity Distribution & Visual Proportion</span>
            <span className="text-muted-foreground">{metrics.total} Incidents Logged</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-elevated border border-border/40">
            {metrics.total > 0 ? (
              <>
                <div
                  style={{ width: `${(metrics.critical / metrics.total) * 100}%` }}
                  className="bg-red-500 h-full transition-all"
                  title={`Critical: ${metrics.critical}`}
                />
                <div
                  style={{ width: `${(metrics.high / metrics.total) * 100}%` }}
                  className="bg-orange-500 h-full transition-all"
                  title={`High: ${metrics.high}`}
                />
                <div
                  style={{ width: `${(metrics.moderate / metrics.total) * 100}%` }}
                  className="bg-yellow-500 h-full transition-all"
                  title={`Moderate: ${metrics.moderate}`}
                />
                <div
                  style={{ width: `${((metrics.total - (metrics.critical + metrics.high + metrics.moderate)) / metrics.total) * 100}%` }}
                  className="bg-emerald-500 h-full transition-all"
                  title={`Low: ${metrics.total - (metrics.critical + metrics.high + metrics.moderate)}`}
                />
              </>
            ) : (
              <div className="w-full h-full bg-muted/20" />
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Critical ({metrics.critical})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" /> High ({metrics.high})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-yellow-500" /> Moderate ({metrics.moderate})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Low ({metrics.total - (metrics.critical + metrics.high + metrics.moderate)})</span>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-foreground">Filters</h3>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="severityFilter" className="text-sm font-medium text-foreground">
                Severity
              </label>
              <Select
                id="severityFilter"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
              >
                <option value="ALL">All</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MODERATE">Moderate</option>
                <option value="LOW">Low</option>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="typeFilter" className="text-sm font-medium text-foreground">
                Incident type
              </label>
              <Select
                id="typeFilter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              >
                <option value="ALL">All</option>
                {(Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[]).map((type) => (
                  <option key={type} value={type}>
                    {INCIDENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="statusFilter" className="text-sm font-medium text-foreground">
                Status
              </label>
              <Select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="ALL">All</option>
                <option value="NEW">New</option>
                <option value="VERIFIED">Verified</option>
                <option value="RESOLVED">Resolved</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <SectionHeader
            title="Incident Map"
            description="Geographic overview of currently filtered incidents."
          />
          {loadState === "loading" ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground" role="status">
                Loading incidents…
              </CardContent>
            </Card>
          ) : (
            <IncidentMap incidents={filteredIncidents} />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            Incident Feed
            {loadState === "loaded" && (
              <span className="ml-2 font-normal text-muted-foreground">
                {filteredIncidents.length} of {incidents.length}
              </span>
            )}
          </h3>

          {loadState === "loading" && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground" role="status">
                Loading incidents…
              </CardContent>
            </Card>
          )}

          {loadState === "error" && (
            <Card>
              <CardContent className="p-6 text-sm text-destructive" role="alert">
                {errorMessage ?? "Unable to load incidents."}
              </CardContent>
            </Card>
          )}

          {loadState === "loaded" && incidents.length === 0 && (
            <Card>
              <CardContent className="flex flex-col gap-1 p-6 text-sm text-muted-foreground">
                <p>No incidents reported yet.</p>
                <p>New emergency reports will appear here.</p>
              </CardContent>
            </Card>
          )}

          {loadState === "loaded" && incidents.length > 0 && filteredIncidents.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No incidents match the current filters.
              </CardContent>
            </Card>
          )}

          {loadState === "loaded" &&
            filteredIncidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/incidents/${incident.id}`}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className="transition-colors hover:border-border-strong">
                  <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      {incident.severity && (
                        <Badge variant={SEVERITY_BADGE_VARIANT[incident.severity]}>
                          <span aria-hidden="true" className="mr-1">
                            {SEVERITY_DOT[incident.severity]}
                          </span>
                          {incident.severity}
                          {incident.priorityScore !== null ? ` · ${incident.priorityScore}/100` : ""}
                        </Badge>
                      )}
                      <Badge variant="default">
                        {incident.incidentType
                          ? INCIDENT_TYPE_LABELS[incident.incidentType]
                          : "Uncategorized"}
                      </Badge>
                      <Badge variant="default">{incident.status}</Badge>
                      {incident.latitude !== null && incident.longitude !== null && (
                        <span className="text-xs text-muted-foreground">Location provided</span>
                      )}
                    </div>

                    {incident.summary && (
                      <p className="text-sm text-foreground">{incident.summary}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {incident.peopleAffected !== null && (
                        <span>{incident.peopleAffected} people affected</span>
                      )}
                      <span>{formatRelativeTime(incident.createdAt)}</span>
                    </div>

                    <IndicatorBadges incident={incident} />
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>
      </PageShell>
    </main>
  );
}
