"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Eye, EyeOff, Search, Filter, Sparkles, MoreHorizontal,
  GraduationCap, Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";
import { adminApi, type Course } from "@/lib/api-client";

type StatusFilter = "all" | "active" | "draft";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [generatingThumb, setGeneratingThumb] = useState<string | null>(null);

  useEffect(() => {
    adminApi.listCourses()
      .then(setCourses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (course: Course) => {
    setToggling(course.id);
    try {
      if (course.status === "active") {
        await adminApi.unpublishCourse(course.id);
        setCourses((prev) => prev.map((c) => c.id === course.id ? { ...c, status: "draft", published_at: null } : c));
      } else {
        await adminApi.publishCourse(course.id);
        setCourses((prev) => prev.map((c) => c.id === course.id ? { ...c, status: "active", published_at: new Date().toISOString() } : c));
      }
    } catch (e) {
      console.error(e);
    }
    setToggling(null);
  };

  const handleGenerateThumbnail = async (course: Course) => {
    setGeneratingThumb(course.id);
    try {
      const data = await adminApi.generateThumbnail(course.id);
      setCourses((prev) => prev.map((c) => c.id === course.id ? { ...c, thumbnail_url: data.thumbnail_url } : c));
    } catch (e) {
      console.error(e);
    }
    setGeneratingThumb(null);
  };

  const filtered = courses.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search && !c.title.toLowerCase().includes(search.toLowerCase()) && !c.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const publishedCount = courses.filter((c) => c.status === "active").length;
  const draftCount = courses.filter((c) => c.status !== "active").length;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold text-foreground tracking-tight">Courses</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {publishedCount} published, {draftCount} draft{draftCount !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/upload">
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Sparkles className="h-4 w-4" /> New Course
            </button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 flex-1 max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center rounded-lg bg-muted/50 p-0.5">
            {(["all", "active", "draft"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? `All (${courses.length})` : f === "active" ? `Published (${publishedCount})` : `Drafts (${draftCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* Course Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((course, i) => {
            const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const thumbSrc = course.thumbnail_url
              ? (course.thumbnail_url.startsWith("http") ? course.thumbnail_url : `${apiBase}${course.thumbnail_url}`)
              : null;

            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.3 }}
              >
                <div className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/20 transition-colors group">
                  {/* Thumbnail */}
                  <div className="relative h-36 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
                    {thumbSrc ? (
                      <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <GraduationCap className="h-10 w-10 text-primary/15" />
                      </div>
                    )}
                    {/* Status badge */}
                    <div className="absolute top-3 left-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm ${
                        course.status === "active"
                          ? "bg-emerald-500/90 text-white"
                          : "bg-amber-500/90 text-white"
                      }`}>
                        {course.status === "active" ? "Published" : "Draft"}
                      </span>
                    </div>
                    {/* Generate thumbnail button */}
                    {!thumbSrc && (
                      <button
                        onClick={() => handleGenerateThumbnail(course)}
                        disabled={generatingThumb === course.id}
                        className="absolute top-3 right-3 rounded-full bg-white/80 backdrop-blur-sm p-1.5 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        title="Generate AI thumbnail"
                      >
                        {generatingThumb === course.id ? (
                          <span className="h-4 w-4 block animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : (
                          <ImageIcon className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-1">{course.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 min-h-[2rem]">{course.description}</p>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <button
                        onClick={() => handleToggle(course)}
                        disabled={toggling === course.id}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          course.status === "active"
                            ? "text-muted-foreground hover:bg-muted"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                      >
                        {toggling === course.id ? "..." : course.status === "active" ? (
                          <><EyeOff className="h-3.5 w-3.5" /> Unpublish</>
                        ) : (
                          <><Eye className="h-3.5 w-3.5" /> Publish</>
                        )}
                      </button>
                      {course.published_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(course.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <GraduationCap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search || statusFilter !== "all" ? "No courses match your filters." : "No courses yet."}
            </p>
            {!search && statusFilter === "all" && (
              <Link href="/upload" className="text-xs text-primary hover:underline mt-1 inline-block">Create your first course</Link>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
