"use client";

import { Sparkles, AlertTriangle, TrendingUp, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

interface InsightBannerProps {
  title?: string;
  children: ReactNode;
  variant?: "insight" | "warning" | "success";
}

const variants: Record<string, { icon: LucideIcon; bg: string; iconColor: string; titleColor: string; textColor: string }> = {
  insight: { icon: Sparkles, bg: "bg-primary/5", iconColor: "text-primary", titleColor: "text-primary", textColor: "text-primary/80" },
  warning: { icon: AlertTriangle, bg: "bg-warning/8", iconColor: "text-warning", titleColor: "text-warning", textColor: "text-warning/80" },
  success: { icon: TrendingUp, bg: "bg-success/8", iconColor: "text-success", titleColor: "text-success", textColor: "text-success/80" },
};

export function InsightBanner({ title = "AI Observation", children, variant = "insight" }: InsightBannerProps) {
  const v = variants[variant];
  return (
    <div className={`rounded-xl ${v.bg} p-4`}>
      <div className="flex items-start gap-2.5">
        <v.icon className={`mt-0.5 h-4 w-4 shrink-0 ${v.iconColor}`} />
        <div>
          <p className={`text-sm font-semibold ${v.titleColor}`}>{title}</p>
          <p className={`mt-1 text-sm ${v.textColor} leading-relaxed`}>{children}</p>
        </div>
      </div>
    </div>
  );
}
