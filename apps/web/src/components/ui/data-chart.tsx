"use client";

import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const COLORS = ["#4d9e8e", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#10b981"];

interface DataChartProps {
  chart_type: "bar" | "pie" | "line";
  data: Array<{ name: string; value: number }>;
  title?: string;
  caption?: string;
}

export function DataChart({ chart_type, data, title, caption }: DataChartProps) {
  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      {title && (
        <p className="text-xs font-semibold text-foreground mb-3">{title}</p>
      )}
      <ResponsiveContainer width="100%" height={200}>
        {chart_type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : chart_type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#4d9e8e" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
      {caption && (
        <p className="mt-2 text-xs text-muted-foreground italic">{caption}</p>
      )}
    </div>
  );
}
