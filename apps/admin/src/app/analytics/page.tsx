"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Users, Target, Clock } from "lucide-react";
import { adminApi, type AnalyticsOverview } from "@/lib/api-client";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const CHART_COLORS = {
  primary: "hsl(174, 42%, 40%)",
  secondary: "hsl(210, 70%, 55%)",
  accent: "hsl(38, 92%, 50%)",
  muted: "hsl(220, 13%, 89%)",
};

const weeklyTrend = [
  { week: "W1", sessions: 42 }, { week: "W2", sessions: 56 }, { week: "W3", sessions: 68 },
  { week: "W4", sessions: 51 }, { week: "W5", sessions: 89 }, { week: "W6", sessions: 104 }, { week: "W7", sessions: 98 },
];

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [courseData, setCourseData] = useState<Array<{ name: string; enrolled: number; active: number; avg_completion: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getOverview(), adminApi.getCourseAnalytics()])
      .then(([ov, courses]) => {
        setOverview(ov);
        setCourseData(courses.map((c) => ({
          name: c.name.length > 22 ? c.name.slice(0, 20) + "…" : c.name,
          enrolled: c.enrolled,
          active: c.active,
          avg_completion: c.avg_completion,
        })));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-display font-bold text-foreground tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Insights into learner engagement and course performance</p>
        </div>

        {/* Highlight cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Users, label: "Active Learners", value: overview?.active_learners || 0, sub: `of ${overview?.total_learners || 0} total` },
            { icon: TrendingUp, label: "Sessions (7d)", value: weeklyTrend[weeklyTrend.length - 1].sessions, sub: "+5% vs prior week" },
            { icon: Clock, label: "Avg. Session", value: "17 min", sub: "" },
            { icon: Target, label: "Completion", value: `${Math.round(overview?.avg_completion_rate || 0)}%`, sub: "across all courses" },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4.5 w-4.5 text-primary" />
                </div>
              </div>
              <p className="text-2xl font-semibold text-foreground tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              {sub && <p className="text-xs text-primary/80 mt-1">{sub}</p>}
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Weekly sessions trend */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Weekly Sessions</h3>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrend}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.muted} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#888" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_COLORS.muted}`, background: "#fff" }} />
                  <Area type="monotone" dataKey="sessions" stroke={CHART_COLORS.primary} fill="url(#grad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Course enrollment comparison */}
          {courseData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Course Enrollment</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={courseData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.muted} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#888" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_COLORS.muted}`, background: "#fff" }} />
                    <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12, color: "#888" }}>{String(v)}</span>} />
                    <Bar dataKey="enrolled" name="Enrolled" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="active" name="Active" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Category breakdown table */}
        {overview?.top_categories && overview.top_categories.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-semibold text-foreground">Course Performance</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Enrollment and progress by category</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/30">
                  <th className="text-left text-xs uppercase tracking-wider text-muted-foreground font-medium px-5 py-2.5">Category</th>
                  <th className="text-left text-xs uppercase tracking-wider text-muted-foreground font-medium px-5 py-2.5">Enrolled</th>
                  <th className="text-left text-xs uppercase tracking-wider text-muted-foreground font-medium px-5 py-2.5 w-48">Progress</th>
                </tr>
              </thead>
              <tbody>
                {overview.top_categories.map((c) => (
                  <tr key={c.name} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-foreground">{c.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{c.enrolled}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${c.avg_progress}%` }} />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground w-8">{c.avg_progress}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
