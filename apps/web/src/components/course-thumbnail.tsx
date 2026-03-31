"use client";

interface CourseThumbnailProps {
  title: string;
  category?: string;
  thumbnailUrl?: string;
  size?: "sm" | "md" | "lg";
}

const CATEGORY_THEMES: Record<string, { gradient: string; icon: string; accent: string }> = {
  coding: {
    gradient: "from-violet-600 via-purple-500 to-indigo-600",
    icon: "{ }",
    accent: "bg-violet-500",
  },
  business: {
    gradient: "from-amber-500 via-orange-500 to-red-500",
    icon: "B",
    accent: "bg-amber-500",
  },
  science: {
    gradient: "from-cyan-500 via-teal-500 to-emerald-500",
    icon: "S",
    accent: "bg-teal-500",
  },
  creative: {
    gradient: "from-pink-500 via-rose-500 to-fuchsia-500",
    icon: "C",
    accent: "bg-pink-500",
  },
  general: {
    gradient: "from-primary via-violet-500 to-indigo-500",
    icon: "N",
    accent: "bg-primary",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  coding: "Programming",
  business: "Business",
  science: "Science",
  creative: "Creative",
  general: "Professional Development",
};

const PATTERN_VARIANTS = 4; // Number of different patterns
const LG_SIZE = "h-44";
const SM_SIZE = "h-24";
const MD_SIZE = "h-36";

export function CourseThumbnail({ title, category, thumbnailUrl, size = "md" }: CourseThumbnailProps) {
  const theme = CATEGORY_THEMES[category || "general"] || CATEGORY_THEMES.general;
  const dims = size === "lg" ? LG_SIZE : size === "sm" ? SM_SIZE : MD_SIZE;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // If we have a real thumbnail, show it
  if (thumbnailUrl) {
    const fullUrl = thumbnailUrl.startsWith("http") ? thumbnailUrl : `${apiBase}${thumbnailUrl}`;
    return (
      <div className={`${dims} w-full rounded-t-2xl relative overflow-hidden bg-muted`}>
        <img
          src={fullUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        {/* Subtle gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        {/* Category badge */}
        <div className="absolute top-3 left-3">
          <span className="rounded-lg bg-black/30 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-white">
            {CATEGORY_LABELS[category || "general"] || "Course"}
          </span>
        </div>
      </div>
    );
  }

  // Fallback: gradient with decorative pattern
  const hash = title.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const pattern = hash % PATTERN_VARIANTS;

  return (
    <div className={`${dims} w-full rounded-t-2xl bg-gradient-to-br ${theme.gradient} relative overflow-hidden`}>
      <div className="absolute inset-0 opacity-[0.12]">
        {pattern === 0 && (
          <>
            <div className="absolute top-4 right-4 h-20 w-20 rounded-full border-[3px] border-white" />
            <div className="absolute top-8 right-8 h-12 w-12 rounded-full border-[3px] border-white" />
            <div className="absolute bottom-4 left-4 h-16 w-16 rounded-full border-[3px] border-white" />
          </>
        )}
        {pattern === 1 && (
          <>
            <div className="absolute -top-4 -right-4 h-32 w-32 rounded-3xl border-[3px] border-white rotate-12" />
            <div className="absolute bottom-2 left-6 h-16 w-16 rounded-xl border-[3px] border-white -rotate-6" />
          </>
        )}
        {pattern === 2 && (
          <>
            <div className="absolute top-6 left-6 h-1 w-12 bg-white rounded" />
            <div className="absolute top-10 left-6 h-1 w-20 bg-white rounded" />
            <div className="absolute top-14 left-6 h-1 w-8 bg-white rounded" />
            <div className="absolute bottom-6 right-6 h-14 w-14 rounded-full border-[3px] border-white" />
          </>
        )}
        {pattern === 3 && (
          <>
            <div className="absolute top-4 right-4 w-24 h-24 rounded-2xl border-[3px] border-white rotate-45" />
            <div className="absolute bottom-4 left-8 w-10 h-10 rounded-lg border-[3px] border-white rotate-12" />
          </>
        )}
      </div>
      <div className="absolute top-3 left-3">
        <span className="rounded-lg bg-white/20 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-white">
          {CATEGORY_LABELS[category || "general"] || "Course"}
        </span>
      </div>
      <div className="absolute bottom-3 right-3 text-white/20 text-4xl font-bold font-display">
        {theme.icon}
      </div>
    </div>
  );
}
