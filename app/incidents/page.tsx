"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Filter, AlertTriangle, ArrowUpRight } from "lucide-react";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/layout/section-header";
import type { IncidentSeverity, IncidentStatus, IncidentType } from "@/lib/supabase/types";

interface IncidentItem {
  id: string;
  incidentType: IncidentType | null;
  summary: string | null;
  latitude: number | null;
  longitude: number | null;
  peopleAffected: number | null;
  priorityScore: number | null;
  severity: IncidentSeverity | null;
  status: IncidentStatus;
  createdAt: string;
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

export default function IncidentsListPage() {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/incidents", { cache: "no-store" });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setIncidents(json.data);
        }
      } catch (err) {
        console.error("Failed loading incidents list", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return incidents.filter((item) => {
      if (severityFilter !== "ALL" && item.severity !== severityFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && item.incidentType !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const summary = (item.summary || "").toLowerCase();
        const type = (item.incidentType ? INCIDENT_TYPE_LABELS[item.incidentType] : "").toLowerCase();
        if (!summary.includes(q) && !type.includes(q)) return false;
      }
      return true;
    });
  }, [incidents, severityFilter, statusFilter, typeFilter, search]);

  return (
    <main className="flex flex-1">
      <PageShell>
        <SectionHeader
          title="Incident Operations Center"
          description="Filter, search, and investigate all reported disaster incidents."
        />

        {/* Search & Filters Controls */}
        <Card className="border-border/80 bg-surface">
          <CardContent className="p-4 space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search incidents by summary text or type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="text-xs">
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MODERATE">Moderate</option>
                <option value="LOW">Low</option>
              </Select>

              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs">
                <option value="ALL">All Types</option>
                {(Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[]).map((t) => (
                  <option key={t} value={t}>{INCIDENT_TYPE_LABELS[t]}</option>
                ))}
              </Select>

              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs">
                <option value="ALL">All Statuses</option>
                <option value="NEW">NEW</option>
                <option value="VERIFIED">VERIFIED</option>
                <option value="RESOLVED">RESOLVED</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* List Content */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs text-muted-foreground px-1">
            <span>Showing <strong>{filtered.length}</strong> of {incidents.length} incidents</span>
          </div>

          {loading && (
            <Card>
              <CardContent className="p-6 text-xs text-muted-foreground">Loading incidents...</CardContent>
            </Card>
          )}

          {!loading && filtered.length === 0 && (
            <Card>
              <CardContent className="p-6 text-xs text-muted-foreground">No incidents match your search or filter parameters.</CardContent>
            </Card>
          )}

          {!loading &&
            filtered.map((incident) => (
              <Link key={incident.id} href={`/incidents/${incident.id}`} className="block">
                <Card className="hover:border-primary/40 transition-all">
                  <CardContent className="p-4 sm:p-5 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {incident.severity && (
                          <Badge variant={SEVERITY_BADGE_VARIANT[incident.severity]}>
                            {incident.severity} · {incident.priorityScore}/100
                          </Badge>
                        )}
                        <Badge variant="default">
                          {incident.incidentType ? INCIDENT_TYPE_LABELS[incident.incidentType] : "Uncategorized"}
                        </Badge>
                        <Badge variant="default">{incident.status}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span>{formatRelativeTime(incident.createdAt)}</span>
                        <ArrowUpRight size={14} />
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm font-semibold text-foreground">
                      {incident.summary ?? "No summary provided."}
                    </p>

                    {incident.peopleAffected !== null && (
                      <p className="text-[11px] text-muted-foreground">
                        Impact: {incident.peopleAffected} people affected
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>
      </PageShell>
    </main>
  );
}
