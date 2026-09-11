"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { IncidentType } from "@/lib/supabase/types";

const TYPE_LABELS: Record<IncidentType, string> = {
  flood: "Flood",
  earthquake: "Earthquake",
  fire: "Fire",
  building_collapse: "Collapse",
  medical_emergency: "Medical",
  missing_person: "Missing",
  road_blockage: "Road Block",
  food_shortage: "Food",
  shelter_need: "Shelter",
  other: "Other",
};

interface TypeBarChartProps {
  incidents: { incidentType: IncidentType | null }[];
}

export function TypeBarChart({ incidents }: TypeBarChartProps) {
  const data = useMemo(() => {
    const counts: Partial<Record<IncidentType, number>> = {};
    incidents.forEach(({ incidentType }) => {
      if (!incidentType) return;
      counts[incidentType] = (counts[incidentType] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type: TYPE_LABELS[type as IncidentType] ?? type, count }))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 7);
  }, [incidents]);

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
        No incident types recorded yet
      </div>
    );
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={80} />
          <Tooltip
            contentStyle={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
            labelStyle={{ color: "var(--foreground)" }}
            itemStyle={{ color: "var(--primary)" }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill="var(--primary)" fillOpacity={1 - i * 0.1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
