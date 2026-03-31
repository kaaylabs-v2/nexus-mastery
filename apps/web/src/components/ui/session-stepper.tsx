"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { type SessionStep, type SessionStage } from "@/lib/mock-data";

interface SessionStepperProps {
  steps: SessionStep[];
  className?: string;
}

const stageColors: Record<SessionStage, string> = {
  clarify: "#0D9488",
  challenge: "#F59E0B",
  show_your_work: "#3B82F6",
  alternatives: "#8B5CF6",
  learn_from_it: "#10B981",
};

export function SessionStepper({ steps, className }: SessionStepperProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {steps.map((step, i) => {
        const color = stageColors[step.stage];
        return (
          <div key={step.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  step.completed && "text-white",
                  step.active && "ring-2 ring-offset-2",
                  !step.completed && !step.active && "border border-gray-300 text-gray-400"
                )}
                style={{
                  backgroundColor: step.completed || step.active ? color : undefined,
                  "--tw-ring-color": step.active ? color : undefined,
                } as React.CSSProperties}
              >
                {step.completed ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  step.id
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "my-0.5 w-0.5 flex-1",
                    step.completed ? "bg-gray-300" : "bg-gray-200"
                  )}
                  style={{ minHeight: 16 }}
                />
              )}
            </div>
            <span
              className={cn(
                "pt-0.5 text-xs",
                step.active ? "font-semibold text-gray-900" : step.completed ? "text-gray-500" : "text-gray-400"
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
