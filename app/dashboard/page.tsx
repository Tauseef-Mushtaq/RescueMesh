"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Play, AlertTriangle, Activity, ShieldAlert, Layers } from "lucide-react";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/layout/section-header";
import dynamic from "next/dynamic";
import type { IncidentSeverity, IncidentStatus, IncidentType } from "@/lib/supabase/types";

const IncidentMap = dynamic(
  () => import("@/components/map/incident-map").then((m) => ({ default: m.IncidentMap })),
  {
    ssr: false,
    loading: () => <div className="h-[420px] md:h-[520px] w-full bg-surface-elevated animate-pulse rounded-xl flex items-center justify-center text-xs text-muted-foreground">Loading Map...</div>,
  }
);

const IncidentTrendChart = dynamic(
  () => import("@/components/charts/incident-trend-chart").then((m) => ({ default: m.IncidentTrendChart })),
  { ssr: false, loading: () => <div className="h-48 w-full bg-surface-elevated animate-pulse rounded-lg" /> }
);

const SeverityDonutChart = dynamic(
  () => import("@/components/charts/severity-donut-chart").then((m) => ({ default: m.SeverityDonutChart })),
  { ssr: false, loading: () => <div className="h-48 w-full bg-surface-elevated animate-pulse rounded-lg" /> }
);

const TypeBarChart = dynamic(
  () => import("@/components/charts/type-bar-chart").then((m) => ({ default: m.TypeBarChart })),
  { ssr: false, loading: () => <div className="h-40 w-full bg-surface-elevated animate-pulse rounded-lg" /> }
);

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
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function StatCard({
  label,
  value,
  accentClassName,
  sublabel,
}: {
  label: string;
  value: number;
  accentClassName?: string;
  sublabel?: string;
}) {
  return (
    <Card className="border-border/80 bg-surface">
      <CardContent className="flex flex-col gap-1 p-4 sm:p-5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={`text-3xl font-black tabular-nums ${accentClassName ?? "text-foreground"}`}>
          {value}
        </span>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
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
    <div className="flex flex-wrap gap-1.5 pt-1">
      {indicators.map((indicator) => (
        <Badge key={indicator} variant="default" className="text-[10px]">
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
      low: incidents.filter((i) => i.severity === "LOW").length,
      active: incidents.filter((i) => i.status === "NEW" || i.status === "VERIFIED").length,
      total: incidents.length,
    };
  }, [incidents]);

  const needsAttention = useMemo(() => {
    return incidents
      .filter((i) => i.severity === "CRITICAL" && i.status === "NEW")
      .slice(0, 3);
  }, [incidents]);

  return (
    <main className="flex flex-1">
      <PageShell>
        <SectionHeader
          title="Command Center"
          description="Live emergency intelligence and operational status overview."
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
                className="gap-1 text-xs"
              >
                <Play size={12} />
                Load Demo Disaster
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={fetchIncidents}
                disabled={loadState === "loading"}
                className="gap-1 text-xs"
              >
                <RefreshCw size={12} className={loadState === "loading" ? "animate-spin" : ""} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Critical" value={metrics.critical} accentClassName="text-critical" sublabel="Immediate attention required" />
          <StatCard label="High Severity" value={metrics.high} accentClassName="text-high" sublabel="Urgent evaluation needed" />
          <StatCard label="Active Operations" value={metrics.active} accentClassName="text-primary" sublabel="New + Verified status" />
          <StatCard label="Total Logged" value={metrics.total} sublabel="All time reports" />
        </div>

        {/* Charts Grid */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 border-border/80 bg-surface space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">7-Day Incident Trend</h3>
              <span className="text-[10px] text-muted-foreground">Activity Timeline</span>
            </div>
            <IncidentTrendChart incidents={incidents} />
          </Card>

          <Card className="p-4 border-border/80 bg-surface space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Severity Breakdown</h3>
              <span className="text-[10px] text-muted-foreground">Risk Proportion</span>
            </div>
            <SeverityDonutChart
              critical={metrics.critical}
              high={metrics.high}
              moderate={metrics.moderate}
              low={metrics.low}
            />
          </Card>
        </div>

        {/* Needs Attention Section (if any critical new incidents exist) */}
        {needsAttention.length > 0 && (
          <Card className="border-critical/40 bg-critical/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-critical uppercase tracking-wider">
              <ShieldAlert size={16} />
              Needs Immediate Attention ({needsAttention.length} Unresolved Critical)
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {needsAttention.map((inc) => (
                <Link
                  key={inc.id}
                  href={`/incidents/${inc.id}`}
                  className="p-3 rounded-lg bg-surface border border-critical/30 hover:border-critical transition-all text-xs space-y-1 block"
                >
                  <div className="flex justify-between items-center">
                    <Badge variant="critical">CRITICAL · {inc.priorityScore}/100</Badge>
                    <span className="text-[10px] text-muted-foreground">{formatRelativeTime(inc.createdAt)}</span>
                  </div>
                  <p className="font-semibold text-foreground truncate">{inc.summary ?? "Uncategorized report"}</p>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* Incident Type Distribution */}
        <Card className="p-4 border-border/80 bg-surface space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Incident Types</h3>
            <span className="text-[10px] text-muted-foreground">Top Categories</span>
          </div>
          <TypeBarChart incidents={incidents} />
        </Card>

        {/* Filters */}
        <Card className="border-border/80 bg-surface">
          <CardHeader className="pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Filters</h3>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="severityFilter" className="text-xs font-medium text-muted-foreground">
                Severity
              </label>
              <Select
                id="severityFilter"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
                className="text-xs"
              >
                <option value="ALL">All severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MODERATE">Moderate</option>
                <option value="LOW">Low</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="typeFilter" className="text-xs font-medium text-muted-foreground">
                Incident type
              </label>
              <Select
                id="typeFilter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="text-xs"
              >
                <option value="ALL">All incident types</option>
                {(Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[]).map((type) => (
                  <option key={type} value={type}>
                    {INCIDENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="statusFilter" className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <Select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="text-xs"
              >
                <option value="ALL">All statuses</option>
                <option value="NEW">New</option>
                <option value="VERIFIED">Verified</option>
                <option value="RESOLVED">Resolved</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Map Section */}
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="Geospatial Map"
            description="Geographic distribution of currently filtered incidents."
          />
          {loadState === "loading" ? (
            <Card>
              <CardContent className="p-6 text-xs text-muted-foreground" role="status">
                Loading incident map…
              </CardContent>
            </Card>
          ) : (
            <IncidentMap incidents={filteredIncidents} />
          )}
        </div>

        {/* Incident Feed List */}
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-baseline">
            <h3 className="text-sm font-bold text-foreground">
              Incident Feed
              {loadState === "loaded" && (
                <span className="ml-2 font-normal text-xs text-muted-foreground">
                  ({filteredIncidents.length} of {incidents.length} incidents)
                </span>
              )}
            </h3>
          </div>

          {loadState === "loading" && (
            <Card>
              <CardContent className="p-6 text-xs text-muted-foreground" role="status">
                Loading incidents…
              </CardContent>
            </Card>
          )}

          {loadState === "error" && (
            <Card>
              <CardContent className="p-6 text-xs text-danger" role="alert">
                {errorMessage ?? "Unable to load incidents."}
              </CardContent>
            </Card>
          )}

          {loadState === "loaded" && incidents.length === 0 && (
            <Card>
              <CardContent className="p-6 text-xs text-muted-foreground">
                No incidents reported yet. Use &quot;Load Demo Disaster&quot; to seed initial data.
              </CardContent>
            </Card>
          )}

          {loadState === "loaded" && incidents.length > 0 && filteredIncidents.length === 0 && (
            <Card>
              <CardContent className="p-6 text-xs text-muted-foreground">
                No incidents match the selected filters.
              </CardContent>
            </Card>
          )}

          {loadState === "loaded" &&
            filteredIncidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/incidents/${incident.id}`}
                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Card className="transition-all hover:border-primary/40">
                  <CardContent className="flex flex-col gap-2 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
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
                      </div>
                      <span className="text-[11px] text-muted-foreground">{formatRelativeTime(incident.createdAt)}</span>
                    </div>

                    {incident.summary && (
                      <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                        {incident.summary}
                      </p>
                    )}

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
