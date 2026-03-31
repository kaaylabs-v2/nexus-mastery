"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, TrendingUp, Clock, Target } from "lucide-react";
import { adminApi, type AnalyticsOverview } from "@/lib/api-client";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["hsl(174, 42%, 40%)", "hsl(174, 42%, 55%)", "hsl(210, 70%, 55%)", "hsl(38, 92%, 50%)", "hsl(152, 55%, 42%)"];

const weeklyTrend = [
  { week: "W1", sessions: 42 }, { week: "W2", sessions: 56 }, { week: "W3", sessions: 68 },
  { week: "W4", sessions: 51 }, { week: "W5", sessions: 89 }, { week: "W6", sessions: 104 }, { week: "W7", sessions: 98 },
];

const levelDist = [
  { name: "Level 1", value: 12 }, { name: "Level 2", value: 28 },
  { name: "Level 3", value: 16 }, { name: "Level 4", value: 6 }, { name: "Level 5", value: 1 },
];

function StatCard({ icon: Icon, label, value, change }: { icon: typeof Users; label: string; value: string | number; change?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      {change && <p className="text-xs text-primary mt-0.5">{change}</p>}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [courseData, setCourseData] = useState<Array<{ name: string; enrolled: number; active: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getOverview(), adminApi.getCourseAnalytics()])
      .then(([ov, courses]) => {
        setOverview(ov);
        setCourseData(courses.map((c) => ({ name: c.name.slice(0, 20), enrolled: c.enrolled, active: c.active })));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8"><div className="h-8 w-48 animate-pulse rounded bg-muted" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Active Learners" value={overview?.active_learners || 0} change="of enrolled" />
          <StatCard icon={TrendingUp} label="Sessions This Week" value={weeklyTrend[weeklyTrend.length - 1].sessions} change="+5% vs last week" />
          <StatCard icon={Clock} label="Avg. Session Time" value="17 min" />
          <StatCard icon={Target} label="Categories" value={overview?.total_categories || 0} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Weekly Sessions</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrend}>
                  <defs>
                    <linearGradient id="sessionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(174, 42%, 40%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(174, 42%, 40%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <Area type="monotone" dataKey="sessions" stroke="hsl(174, 42%, 40%)" fill="url(#sessionGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Level Distribution</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={levelDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {levelDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted-foreground">{String(v)}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {courseData.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Category Comparison</h3>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={courseData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-muted-foreground">{String(v)}</span>} />
                  <Bar dataKey="enrolled" name="Enrolled" fill="hsl(174, 42%, 40%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="active" name="Active" fill="hsl(210, 70%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {overview?.top_categories && overview.top_categories.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category Breakdown</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs uppercase tracking-wider text-muted-foreground font-medium px-5 py-2.5">Category</th>
                  <th className="text-left text-xs uppercase tracking-wider text-muted-foreground font-medium px-5 py-2.5">Enrolled</th>
                  <th className="text-left text-xs uppercase tracking-wider text-muted-foreground font-medium px-5 py-2.5">Progress</th>
                </tr>
              </thead>
              <tbody>
                {overview.top_categories.map((c) => (
                  <tr key={c.name} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{c.enrolled}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${c.avg_progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{c.avg_progress}%</span>
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
