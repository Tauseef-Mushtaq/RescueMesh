"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Filter, MapPin, ArrowLeft } from "lucide-react";
import { Badge, BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import dynamic from "next/dynamic";
import type { IncidentSeverity, IncidentType } from "@/lib/supabase/types";

const IncidentMap = dynamic(
  () => import("@/components/map/incident-map").then((m) => ({ default: m.IncidentMap })),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-surface animate-pulse flex items-center justify-center text-xs text-muted-foreground">Loading Map engine...</div>,
  }
);

interface IncidentItem {
  id: string;
  incidentType: IncidentType | null;
  summary: string | null;
  latitude: number | null;
  longitude: number | null;
  priorityScore: number | null;
  severity: IncidentSeverity | null;
  status: string;
}

export default function LiveMapPage() {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/incidents", { cache: "no-store" });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setIncidents(json.data);
        }
      } catch (err) {
        console.error("Failed loading incidents for Map page", err);
      }
    }
    load();
  }, []);

  const filtered = incidents.filter((i) => {
    if (severityFilter !== "ALL" && i.severity !== severityFilter) return false;
    if (statusFilter !== "ALL" && i.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full w-full bg-background relative overflow-hidden">
      {/* Top Floating Controls Bar */}
      <div className="z-10 p-4 border-b border-border bg-surface/90 backdrop-blur flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-1.5 rounded-lg border border-border bg-surface-elevated text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-sm font-bold text-foreground">Live Disaster Map</h1>
            <p className="text-[11px] text-muted-foreground">Showing {filtered.length} mapped incidents</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="h-8 text-xs w-36">
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MODERATE">Moderate</option>
            <option value="LOW">Low</option>
          </Select>

          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 text-xs w-32">
            <option value="ALL">All Statuses</option>
            <option value="NEW">NEW</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="RESOLVED">RESOLVED</option>
          </Select>
        </div>
      </div>

      {/* Main Map Canvas */}
      <div className="flex-1 w-full relative">
        <IncidentMap incidents={filtered} />
      </div>
    </div>
  );
}
