"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { adminApi, type Category } from "@/lib/api-client";

type Tab = "scenarios" | "dimensions" | "milestones";

export default function CategoryDetailPage() {
  const params = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [tab, setTab] = useState<Tab>("scenarios");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params?.id as string;
    if (id) adminApi.getCategory(id).then(setCategory).catch(console.error).finally(() => setLoading(false));
  }, [params?.id]);

  if (loading) return <div className="p-8"><div className="h-8 w-48 animate-pulse rounded bg-muted" /></div>;
  if (!category) return <div className="p-8 text-muted-foreground">Category not found</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-lg font-semibold text-foreground">{category.name}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{category.objective}</p>
      </motion.div>

      <div className="flex gap-2 border-b border-border">
        {(["scenarios", "dimensions", "milestones"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "scenarios" && (
        <div className="space-y-3">
          {category.focus_sessions.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.difficulty}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{s.difficulty}</span>
              </div>
            </motion.div>
          ))}
          {category.focus_sessions.length === 0 && <p className="text-xs text-muted-foreground">No scenarios yet</p>}
        </div>
      )}

      {tab === "dimensions" && (
        <div className="space-y-4">
          {category.domains.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-semibold text-foreground">{d.domain_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{d.capabilities.length} capabilities</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {d.capabilities.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border border-border p-2.5">
                      <span className="text-xs text-foreground">{c.name}</span>
                      <span className="text-xs font-semibold text-foreground">{c.progress}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {tab === "milestones" && (
        <div className="space-y-2">
          {category.milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3">
              <div className={`h-4 w-4 rounded-full border-2 ${m.completed ? "bg-primary border-primary" : "border-muted-foreground/30"}`} />
              <span className={`text-xs ${m.completed ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
