"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users, GraduationCap, TrendingUp, Activity,
  ArrowRight, ArrowUpRight, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { adminApi, type AnalyticsOverview, type Course } from "@/lib/api-client";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/20 transition-colors group cursor-pointer">
      <div className="flex items-center justify-between mb-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-[18px] w-[18px] text-primary" />
        </div>
        {href && <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />}
      </div>
      <p className="text-2xl font-semibold text-foreground tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-primary mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getOverview(), adminApi.listCourses()])
      .then(([ov, c]) => { setOverview(ov); setCourses(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const publishedCourses = courses.filter((c) => c.status === "active");
  const draftCourses = courses.filter((c) => c.status !== "active");

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Overview of your learning platform</p>
          </div>
          <Link href="/upload">
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Sparkles className="h-4 w-4" /> Create Course
            </button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Learners"
            value={overview?.total_learners || 0}
            sub={overview?.active_learners ? `${overview.active_learners} active` : undefined}
            href="/users"
          />
          <StatCard
            icon={GraduationCap}
            label="Published Courses"
            value={publishedCourses.length}
            sub={draftCourses.length > 0 ? `${draftCourses.length} drafts` : undefined}
            href="/courses"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg. Completion"
            value={`${Math.round(overview?.avg_completion_rate || 0)}%`}
            href="/analytics"
          />
          <StatCard
            icon={Activity}
            label="Categories"
            value={overview?.total_categories || 0}
            href="/courses"
          />
        </div>

        {/* Two-column: Recent Courses + Top Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Recent Courses */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Courses</h2>
              <Link href="/courses" className="text-xs text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {courses.slice(0, 5).map((course) => (
                <div key={course.id} className="px-5 py-3 flex items-center gap-3">
                  {course.thumbnail_url ? (
                    <img src={course.thumbnail_url.startsWith("http") ? course.thumbnail_url : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${course.thumbnail_url}`}
                      alt="" className="h-10 w-14 rounded-md object-cover shrink-0" />
                  ) : (
                    <div className="h-10 w-14 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{course.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{course.description}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    course.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  }`}>
                    {course.status === "active" ? "Live" : "Draft"}
                  </span>
                </div>
              ))}
              {courses.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No courses yet</p>
                  <Link href="/upload" className="text-xs text-primary hover:underline mt-1 inline-block">Create your first course</Link>
                </div>
              )}
            </div>
          </div>

          {/* Top Categories */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Categories</h2>
              <Link href="/analytics" className="text-xs text-primary hover:underline flex items-center gap-1">
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {overview?.top_categories && overview.top_categories.length > 0 ? (
              <div className="divide-y divide-border">
                {overview.top_categories.slice(0, 5).map((cat) => (
                  <div key={cat.name} className="px-5 py-3 flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{cat.name}</p>
                      <p className="text-xs text-muted-foreground">{cat.enrolled} enrolled</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, cat.avg_progress))}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">{cat.avg_progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">No category data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        {overview?.recent_activity && overview.recent_activity.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
            </div>
            <div className="divide-y divide-border">
              {overview.recent_activity.slice(0, 6).map((item, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">{item.user.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{item.user}</span>{" "}
                      <span className="text-muted-foreground">{item.action}</span>{" "}
                      {item.detail}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
