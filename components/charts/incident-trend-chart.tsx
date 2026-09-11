"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TrendData {
  date: string;
  count: number;
}

interface IncidentTrendChartProps {
  incidents: { createdAt: string }[];
}

export function IncidentTrendChart({ incidents }: IncidentTrendChartProps) {
  const data = useMemo((): TrendData[] => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      days[key] = 0;
    }
    incidents.forEach(({ createdAt }) => {
      const d = new Date(createdAt);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (key in days) days[key]++;
    });
    return Object.entries(days).map(([date, count]) => ({ date, count }));
  }, [incidents]);

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
            labelStyle={{ color: "var(--foreground)" }}
            itemStyle={{ color: "var(--primary)" }}
          />
          <Area type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} fill="url(#trendGrad)" dot={false} activeDot={{ r: 4, fill: "var(--primary)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
