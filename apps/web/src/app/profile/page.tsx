"use client";

import { motion } from "framer-motion";
import { useLearner } from "@/contexts/LearnerContext";
import { ProgressCircle } from "@/components/ui/progress-circle";

export default function ProfilePage() {
  const { learner, activeCategory } = useLearner();
  const overallProgress = Math.round((activeCategory.current_level / activeCategory.target_level) * 100);

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">Profile</h1>
        <p className="text-base text-muted-foreground mt-2">Account and learning preferences</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.4 }}>
        <div className="rounded-2xl border border-border/60 bg-card p-7">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary">
              {learner.avatar}
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground">{learner.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{learner.role}</p>
              <p className="text-sm text-muted-foreground">{learner.email}</p>
            </div>
          </div>

          <div className="mt-7 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Category</p>
              <p className="mt-1.5 text-sm text-foreground">{activeCategory.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Current level</p>
              <p className="mt-1.5 text-sm text-foreground">Level {activeCategory.current_level}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Target level</p>
              <p className="mt-1.5 text-sm text-foreground">Level {activeCategory.target_level}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3.5">
            <ProgressCircle value={overallProgress} size={42} strokeWidth={3} />
            <div>
              <p className="text-sm font-medium text-foreground">{overallProgress}% to target</p>
              <p className="text-sm text-muted-foreground">{activeCategory.timeEstimate} estimated</p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }}>
        <div className="rounded-2xl border border-border/60 bg-card p-7">
          <h3 className="text-base font-display font-semibold text-foreground">Learning Preferences</h3>
          <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed">
            Preferences and settings will be configurable in a future update.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
