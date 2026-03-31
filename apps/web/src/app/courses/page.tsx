"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Play, Plus, CheckCircle2, Loader2, LayoutList, Users, ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { USE_MOCK } from "@/lib/auth";

interface Course {
  id: string;
  title: string;
  description: string;
  status: string;
  course_category?: string;
  course_outline?: Array<{ id: number; title: string }>;
  thumbnail_url?: string;
  [key: string]: unknown;
}

const CATEGORY_THEMES: Record<string, { gradient: string }> = {
  coding: { gradient: "from-violet-600 via-purple-500 to-indigo-600" },
  business: { gradient: "from-amber-500 via-orange-500 to-red-500" },
  science: { gradient: "from-cyan-500 via-teal-500 to-emerald-500" },
  creative: { gradient: "from-pink-500 via-rose-500 to-fuchsia-500" },
  general: { gradient: "from-primary via-violet-500 to-indigo-500" },
};

const CATEGORY_LABELS: Record<string, string> = {
  coding: "Programming",
  business: "Business",
  science: "Science",
  creative: "Creative",
  general: "Professional Development",
};

function CourseThumbnail({ title, category, thumbnailUrl }: { title: string; category?: string; thumbnailUrl?: string }) {
  const theme = CATEGORY_THEMES[category || "general"] || CATEGORY_THEMES.general;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Real image thumbnail
  if (thumbnailUrl) {
    const fullUrl = thumbnailUrl.startsWith("http") ? thumbnailUrl : `${apiBase}${thumbnailUrl}`;
    return (
      <div className="h-40 w-full rounded-t-2xl relative overflow-hidden bg-muted">
        <img src={fullUrl} alt={title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <div className="absolute top-3 left-3">
          <span className="rounded-lg bg-black/30 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-white">
            {CATEGORY_LABELS[category || "general"] || "Course"}
          </span>
        </div>
      </div>
    );
  }

  // Fallback gradient
  const hash = title.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const pattern = hash % 4;

  return (
    <div className={`h-40 w-full rounded-t-2xl bg-gradient-to-br ${theme.gradient} relative overflow-hidden`}>
      <div className="absolute inset-0 opacity-[0.12]">
        {pattern === 0 && (
          <>
            <div className="absolute top-4 right-4 h-20 w-20 rounded-full border-[3px] border-white" />
            <div className="absolute bottom-4 left-4 h-16 w-16 rounded-full border-[3px] border-white" />
          </>
        )}
        {pattern === 1 && (
          <div className="absolute -top-4 -right-4 h-32 w-32 rounded-3xl border-[3px] border-white rotate-12" />
        )}
        {pattern === 2 && (
          <>
            <div className="absolute top-6 left-6 h-1 w-12 bg-white rounded" />
            <div className="absolute top-10 left-6 h-1 w-20 bg-white rounded" />
            <div className="absolute bottom-6 right-6 h-14 w-14 rounded-full border-[3px] border-white" />
          </>
        )}
        {pattern === 3 && (
          <div className="absolute top-4 right-4 w-24 h-24 rounded-2xl border-[3px] border-white rotate-45" />
        )}
      </div>
      <div className="absolute top-3 left-3">
        <span className="rounded-lg bg-white/20 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-white">
          {CATEGORY_LABELS[category || "general"] || "Course"}
        </span>
      </div>
    </div>
  );
}

const mockEnrolled: Course[] = [
  { id: "c1", title: "Strategic Decision Making", description: "Master the art of making high-stakes decisions under uncertainty.", status: "active" },
  { id: "c2", title: "Cross-Functional Stakeholder Alignment", description: "Learn to align diverse stakeholders across organizational boundaries.", status: "active" },
];
const mockAvailable: Course[] = [
  { id: "c3", title: "Evidence-Based Decision Making", description: "Strengthen ability to make decisions backed by data and evidence.", status: "active" },
];

export default function CoursesPage() {
  const [enrolled, setEnrolled] = useState<Course[]>([]);
  const [available, setAvailable] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (USE_MOCK) {
      setEnrolled(mockEnrolled);
      setAvailable(mockAvailable);
      setLoading(false);
      return;
    }
    Promise.all([
      apiClient.listMyCourses().catch(() => []),
      apiClient.listAvailableCourses().catch(() => []),
    ]).then(([e, a]) => {
      setEnrolled(e);
      setAvailable(a);
    }).finally(() => setLoading(false));
  }, []);

  const handleEnroll = async (courseId: string) => {
    setEnrolling(courseId);
    try {
      await apiClient.enrollInCourse(courseId);
      const course = available.find((c) => c.id === courseId);
      if (course) {
        setAvailable((prev) => prev.filter((c) => c.id !== courseId));
        setEnrolled((prev) => [...prev, course]);
      }
    } catch (e) {
      alert(String(e));
    }
    setEnrolling(null);
  };

  const handleStartSession = async (courseId: string) => {
    setStartingSession(courseId);
    try {
      const conv = await apiClient.createConversation(courseId);
      router.push(`/session/${conv.id}?course=${courseId}`);
    } catch {
      router.push(`/session/new?course=${courseId}`);
    } finally {
      setStartingSession(null);
    }
  };

  const filterCourses = (courses: Course[]) => {
    if (!searchQuery.trim()) return courses;
    const q = searchQuery.toLowerCase();
    return courses.filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  };

  if (loading) return <div className="p-8"><div className="h-8 w-48 animate-pulse rounded-xl bg-muted/70" /></div>;

  const filteredEnrolled = filterCourses(enrolled);
  const filteredAvailable = filterCourses(available);

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-10">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">Courses</h1>
        <p className="text-base text-muted-foreground mt-2">Browse and enroll in courses tailored to your growth</p>
      </motion.div>

      {/* Search bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search courses..."
            className="w-full rounded-xl border border-border/60 bg-card pl-11 pr-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>
      </motion.div>

      {/* Enrolled Courses */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-semibold text-foreground">
            My Courses
            <span className="ml-2 text-sm font-normal text-muted-foreground">({filteredEnrolled.length})</span>
          </h2>
        </div>
        {filteredEnrolled.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-base text-muted-foreground">
              {searchQuery ? "No enrolled courses match your search." : "You haven't enrolled in any courses yet."}
            </p>
            {!searchQuery && (
              <p className="text-sm text-muted-foreground mt-2">Browse available courses below to get started.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEnrolled.map((course, i) => (
              <motion.div key={course.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4 }}>
                <div className="rounded-2xl border border-border/60 bg-card overflow-hidden hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 group h-full flex flex-col">
                  <CourseThumbnail title={course.title} category={(course as Record<string, unknown>).course_category as string} thumbnailUrl={course.thumbnail_url} />
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug flex-1">
                        {course.title}
                      </h3>
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-1" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed flex-1">{course.description}</p>

                    {course.course_outline && (
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <LayoutList className="h-3.5 w-3.5" />
                        {course.course_outline.length} modules
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-border/50">
                      <button
                        onClick={() => handleStartSession(course.id)}
                        disabled={startingSession === course.id}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
                      >
                        {startingSession === course.id ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Starting...</>
                        ) : (
                          <><Play className="h-4 w-4" /> Start Learning</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Available Courses */}
      {filteredAvailable.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-semibold text-foreground">
              Explore Courses
              <span className="ml-2 text-sm font-normal text-muted-foreground">({filteredAvailable.length})</span>
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAvailable.map((course, i) => (
              <motion.div key={course.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.4 }}>
                <div className="rounded-2xl border border-border/60 bg-card overflow-hidden hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 group h-full flex flex-col">
                  <CourseThumbnail title={course.title} category={(course as Record<string, unknown>).course_category as string} thumbnailUrl={course.thumbnail_url} />
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                      {course.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed flex-1">{course.description}</p>

                    {course.course_outline && (
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <LayoutList className="h-3.5 w-3.5" />
                        {course.course_outline.length} modules
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-border/50">
                      <button
                        onClick={() => handleEnroll(course.id)}
                        disabled={enrolling === course.id}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary/30 text-primary px-4 py-2.5 text-sm font-semibold hover:bg-primary hover:text-primary-foreground transition-all duration-200 disabled:opacity-50"
                      >
                        {enrolling === course.id ? "Enrolling..." : "Enroll Now"}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
