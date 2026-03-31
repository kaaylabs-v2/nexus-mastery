"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ProgressCircle } from "./progress-circle";
import { Play } from "lucide-react";
import { type FocusSkill } from "@/contexts/LearnerContext";

interface MasteryCardProps {
  skill: FocusSkill;
  index?: number;
}

const statusColors: Record<string, string> = {
  critical: "text-destructive bg-destructive/10",
  attention: "text-warning bg-warning/10",
  proficient: "text-success bg-success/10",
  advanced: "text-primary bg-primary/10",
};

const trendLabels: Record<string, { label: string; color: string }> = {
  improving: { label: "Improving", color: "text-success" },
  stable: { label: "Stable", color: "text-muted-foreground" },
  declining: { label: "Declining", color: "text-destructive" },
};

export function MasteryCard({ skill, index = 0 }: MasteryCardProps) {
  const trend = trendLabels[skill.trend];
  const statusClass = statusColors[skill.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
    >
      <Link href="/courses">
        <div className="group rounded-2xl border border-border/60 bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
          <div className="flex items-start justify-between mb-3.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-snug">{skill.name}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{skill.domain}</p>
            </div>
            <ProgressCircle value={skill.progress} size={38} strokeWidth={3} />
          </div>

          <div className="flex items-center gap-2.5 mb-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
              {skill.status === "critical" ? "Critical Gap" : skill.status === "attention" ? "Needs Attention" : skill.status === "proficient" ? "Proficient" : "Advanced"}
            </span>
            <span className={`text-sm font-medium ${trend.color}`}>
              {trend.label}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground mb-2.5">
            <span>Level {skill.current_level} → {skill.target_level}</span>
            <span className="font-medium text-foreground">{skill.progress}%</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-muted/70">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${skill.progress}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="h-3.5 w-3.5" />
            Start session
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
