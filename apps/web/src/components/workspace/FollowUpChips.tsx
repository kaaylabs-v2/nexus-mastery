"use client";

import { Lightbulb, HelpCircle, ListChecks, ArrowRightLeft } from "lucide-react";
import { motion } from "framer-motion";

const CHIPS = [
  { label: "Explain simply", icon: Lightbulb },
  { label: "Quiz me", icon: HelpCircle },
  { label: "Extract key ideas", icon: ListChecks },
  { label: "Compare concepts", icon: ArrowRightLeft },
];

interface FollowUpChipsProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export function FollowUpChips({ onSelect, disabled }: FollowUpChipsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="flex flex-wrap gap-2 mt-3"
    >
      {CHIPS.map((chip) => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.label}
            onClick={() => onSelect(chip.label)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-50"
          >
            <Icon className="h-3 w-3" />
            {chip.label}
          </button>
        );
      })}
    </motion.div>
  );
}
