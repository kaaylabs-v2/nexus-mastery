"use client";

import { TrendingUp } from "lucide-react";
import { userProfile } from "@/lib/mock-data";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-8">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {userProfile.category}
          </span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-500">{userProfile.level}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="inline-flex items-center gap-1 text-xs text-teal-600">
            <TrendingUp className="h-3 w-3" />
            Rising
          </span>
        </div>

        <div className="flex items-center gap-1">
          {Array.from({ length: userProfile.totalStages }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full ${
                i < userProfile.masteryStage
                  ? "bg-teal-600"
                  : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
          {userProfile.avatar}
        </div>
      </div>
    </header>
  );
}
