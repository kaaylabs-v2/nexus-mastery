"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { journalEntries, getStageLabel } from "@/lib/mock-data";

type JournalTab = "assumptions" | "evidence" | "alternatives" | "outcome" | "notes";

export default function JournalPage() {
  const [selectedEntry, setSelectedEntry] = useState(journalEntries[0]);
  const [activeTab, setActiveTab] = useState<JournalTab>("assumptions");

  const tabs: JournalTab[] = ["assumptions", "evidence", "alternatives", "outcome", "notes"];

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">Journal</h1>
        <p className="text-base text-muted-foreground mt-2">Reflect on sessions and track learning patterns</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Timeline */}
        <div className="space-y-2.5">
          <p className="text-sm font-medium text-muted-foreground mb-1">Recent entries</p>
          {journalEntries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => { setSelectedEntry(entry); setActiveTab("assumptions"); }}
              className={cn(
                "flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-all duration-200",
                selectedEntry.id === entry.id
                  ? "border-primary/30 bg-primary/5 shadow-sm"
                  : "border-border/60 bg-card hover:border-primary/20 hover:shadow-sm"
              )}
            >
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{entry.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <span className="mt-1.5 inline-block rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {getStageLabel(entry.stage)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Entry Detail */}
        <AnimatePresence mode="wait">
          <motion.div key={selectedEntry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="space-y-5">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <h2 className="text-lg font-display font-semibold text-foreground">{selectedEntry.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{selectedEntry.scenario}</p>
              <p className="mt-4 text-sm text-foreground leading-relaxed">{selectedEntry.summary}</p>
            </div>

            {selectedEntry.patternDetected && (
              <div className="rounded-2xl border border-warning/20 bg-warning/5 p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <div>
                    <p className="text-sm font-semibold text-warning">Pattern Detected</p>
                    <p className="mt-1 text-sm text-warning/80 leading-relaxed">{selectedEntry.patternDetected}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="flex border-b border-border/60 px-6">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                      activeTab === tab
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div className="p-6">
                {activeTab === "assumptions" && (
                  <ul className="space-y-3">
                    {selectedEntry.assumptions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-foreground leading-relaxed pl-4 relative">
                        <span className="absolute left-0 text-warning">•</span>{a}
                      </li>
                    ))}
                  </ul>
                )}
                {activeTab === "evidence" && (
                  <ul className="space-y-3">
                    {selectedEntry.evidence.map((e, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-foreground leading-relaxed pl-4 relative">
                        <span className="absolute left-0 text-info">•</span>{e}
                      </li>
                    ))}
                  </ul>
                )}
                {activeTab === "alternatives" && (
                  <ul className="space-y-3">
                    {selectedEntry.alternatives.map((a, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-foreground leading-relaxed pl-4 relative">
                        <span className="absolute left-0 text-primary">•</span>{a}
                      </li>
                    ))}
                  </ul>
                )}
                {activeTab === "outcome" && <p className="text-sm text-foreground leading-relaxed">{selectedEntry.outcome}</p>}
                {activeTab === "notes" && <p className="text-sm text-foreground leading-relaxed">{selectedEntry.notes}</p>}
              </div>
            </div>

            {selectedEntry.laterReflection && (
              <div className="rounded-2xl border border-border/60 bg-surface/50 p-6">
                <p className="text-sm font-medium text-muted-foreground">Later reflection</p>
                <p className="mt-2.5 text-sm text-foreground leading-relaxed">{selectedEntry.laterReflection}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
