"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface SeverityDonutChartProps {
  critical: number;
  high: number;
  moderate: number;
  low: number;
}

const COLORS = [
  { key: "Critical", color: "var(--critical)" },
  { key: "High", color: "var(--high)" },
  { key: "Moderate", color: "var(--moderate)" },
  { key: "Low", color: "var(--low)" },
];

export function SeverityDonutChart({ critical, high, moderate, low }: SeverityDonutChartProps) {
  const data = [
    { name: "Critical", value: critical },
    { name: "High", value: high },
    { name: "Moderate", value: moderate },
    { name: "Low", value: low },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
        No incident data recorded yet
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0}>
            {data.map((entry) => {
              const c = COLORS.find((col) => col.key === entry.name);
              return <Cell key={entry.name} fill={c?.color ?? "var(--border)"} />;
            })}
          </Pie>
          <Tooltip
            contentStyle={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
