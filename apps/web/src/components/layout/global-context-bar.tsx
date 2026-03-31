"use client";

import { TrendingUp, Search, Bell } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useLearner } from "@/contexts/LearnerContext";

export function GlobalContextBar() {
  const { learner, activeCategory } = useLearner();
  const router = useRouter();
  const pathname = usePathname();

  // Hide on session pages — they have their own header
  if (pathname?.startsWith("/session")) return null;
  const overallProgress = Math.round(
    (activeCategory.current_level / activeCategory.target_level) * 100
  );

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-card/80 backdrop-blur-sm px-6">
      <div className="flex items-center gap-3.5">
        {/* Category context */}
        <span className="text-sm font-semibold text-foreground">
          {activeCategory.name}
        </span>
        <span className="h-3.5 w-px bg-border/60" />
        <span className="text-sm text-muted-foreground">
          Level {activeCategory.current_level}{" "}
          <span className="text-muted-foreground/50">→ {activeCategory.target_level}</span>
        </span>
        <span className="h-3.5 w-px bg-border/60" />
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <TrendingUp className="h-4 w-4" />
          Rising
        </span>

        {/* Mastery stage dots */}
        <div className="ml-2 flex items-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i < Math.floor(activeCategory.current_level)
                  ? "bg-primary"
                  : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={() => router.push("/courses")}
          title="Browse courses"
          className="rounded-xl p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Search className="h-4 w-4" />
        </button>
        <Link
          href="/history"
          title="Session history"
          className="relative rounded-xl p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
        </Link>
        <Link
          href="/profile"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        >
          {learner.avatar}
        </Link>
      </div>
    </header>
  );
}
