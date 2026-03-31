"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, BookOpen, Users, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { adminApi, type Category } from "@/lib/api-client";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.listCategories()
      .then(async (list) => {
        // Fetch full details for each category
        const full = await Promise.all(list.map((c) => adminApi.getCategory(c.id).catch(() => null)));
        setCategories(full.filter(Boolean) as Category[]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-5">

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{categories.length} categories</p>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> New Category
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((category) => {
              const scenarioCount = category.focus_sessions?.length || 0;
              const dimensionNames = category.domains?.map((d) => d.domain_name) || [];
              const progress = Math.round((category.current_level / Math.max(category.target_level, 0.1)) * 100);

              return (
                <Link key={category.id} href={`/categories/${category.id}`}>
                  <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors cursor-pointer group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <BookOpen className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground">{category.name}</h3>
                            <span className="text-xs font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              active
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{category.objective?.slice(0, 80)}{(category.objective?.length || 0) > 80 ? "..." : ""}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{scenarioCount} scenarios</span>
                            <span>{dimensionNames.length} dimensions</span>
                            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {progress}% progress</span>
                          </div>
                          {dimensionNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {dimensionNames.map((d) => (
                                <span key={d} className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{d}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!confirm(`Delete "${category.name}"? This cannot be undone.`)) return;
                            try {
                              await adminApi.deleteCategory(category.id);
                              setCategories((prev) => prev.filter((c) => c.id !== category.id));
                            } catch (err) {
                              alert(String(err));
                            }
                          }}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete category"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
