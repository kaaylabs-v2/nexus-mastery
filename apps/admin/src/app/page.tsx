"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Upload, Plus, BookOpen, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { adminApi, type AnalyticsOverview } from "@/lib/api-client";

export default function AdminDashboard() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; current_level: number; target_level: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.getOverview(), adminApi.listCategories()])
      .then(([ov, cats]) => { setData(ov); setCategories(cats); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10"><div className="h-8 w-48 animate-pulse rounded bg-muted mx-auto" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-10">

        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Welcome to Arena Studio</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Upload your materials and let AI create mastery categories. Or pick up where you left off.
          </p>
        </div>

        {/* Create actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
          <Link href="/upload">
            <div className="group rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-card p-6 text-center transition-all hover:shadow-sm">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/15 transition-colors">
                <Upload className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Upload & Generate</p>
              <p className="text-xs text-muted-foreground mt-1">Drop a PDF, DOCX, or slides</p>
            </div>
          </Link>

          <Link href="/categories">
            <div className="group rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-card p-6 text-center transition-all hover:shadow-sm">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/15 transition-colors">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Create from Scratch</p>
              <p className="text-xs text-muted-foreground mt-1">Build scenarios manually</p>
            </div>
          </Link>
        </div>

        {/* Recent Categories */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Categories</h2>
            <Link href="/categories" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.3 }}>
                <Link href={`/categories/${c.id}`}>
                  <div className="group rounded-xl border border-border bg-card p-4 text-left hover:border-primary/30 transition-all hover:shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <BookOpen className="h-4 w-4 text-primary/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{c.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">Level {c.current_level} → {c.target_level}</span>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-3.5 w-3.5" /> Recently updated
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}

            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground col-span-2 text-center py-8">No categories yet. Upload materials or create one from scratch.</p>
            )}
          </div>
        </div>

        {/* Quick stats */}
        {data && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{data.total_learners}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Learners</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{data.total_categories}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Categories</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{Math.round(data.avg_completion_rate)}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Completion</p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
