"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, BookOpen, GraduationCap, ArrowRight, Sparkles, MessageSquare, Clock, Users, LayoutList, Star, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLearner } from "@/contexts/LearnerContext";
import { apiClient } from "@/lib/api-client";
import { USE_MOCK } from "@/lib/auth";

interface CourseData {
  id: string;
  title: string;
  description: string;
  course_category?: string;
  course_outline?: Array<{ id: number; title: string }>;
  mastery_criteria?: Record<string, unknown>;
  thumbnail_url?: string;
}

interface ActiveSession {
  id: string;
  course_id: string;
  courseTitle: string;
  courseCategory: string;
  messageCount: number;
  lastMessage: string;
  timeAgo: string;
  progress: number;
}

// Category-specific gradient thumbnails
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

function CourseThumbnail({ title, category, thumbnailUrl, size = "md" }: { title: string; category?: string; thumbnailUrl?: string; size?: "sm" | "md" | "lg" }) {
  const theme = CATEGORY_THEMES[category || "general"] || CATEGORY_THEMES.general;
  const dims = size === "lg" ? "h-44" : size === "sm" ? "h-24" : "h-36";
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
  const pattern = hash % 4;

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

function CourseCard({
  course,
  action,
  onAction,
  loading,
  delay = 0,
}: {
  course: CourseData;
  action: "start" | "enroll";
  onAction: () => void;
  loading: boolean;
  delay?: number;
}) {
  const moduleCount = course.course_outline?.length || 0;
  const category = course.course_category || "general";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: "easeOut" }}
    >
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 group h-full flex flex-col">
        <CourseThumbnail title={course.title} category={category} thumbnailUrl={course.thumbnail_url} />
        <div className="p-5 flex flex-col flex-1">
          <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
            {course.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed flex-1">
            {course.description}
          </p>

          <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
            {moduleCount > 0 && (
              <span className="flex items-center gap-1">
                <LayoutList className="h-3.5 w-3.5" />
                {moduleCount} modules
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              Your org
            </span>
          </div>

          <div className="mt-4 pt-4 border-t border-border/50">
            {action === "start" ? (
              <button
                onClick={onAction}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
              >
                <Play className="h-4 w-4" />
                {loading ? "Starting..." : "Start Learning"}
              </button>
            ) : (
              <button
                onClick={onAction}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-primary/30 text-primary px-4 py-2.5 text-sm font-semibold hover:bg-primary hover:text-primary-foreground transition-all duration-200 disabled:opacity-50"
              >
                {loading ? "Enrolling..." : "Enroll Now"}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { learner } = useLearner();
  const [enrolledCourses, setEnrolledCourses] = useState<CourseData[]>([]);
  const [availableCourses, setAvailableCourses] = useState<CourseData[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (USE_MOCK) return;
    apiClient.listMyCourses().then((c) => setEnrolledCourses(c as unknown as CourseData[])).catch(() => setLoadError("Failed to load courses. Please refresh."));
    apiClient.listAvailableCourses().then((c) => setAvailableCourses(c as unknown as CourseData[])).catch(() => {});

    Promise.all([apiClient.listConversations(), apiClient.listMyCourses()])
      .then(([conversations, courses]) => {
        const courseMap = new Map((courses as unknown as CourseData[]).map((c) => [c.id, c]));
        const active = conversations
          .filter((c) => !c.ended_at && c.messages && c.messages.length > 1)
          .sort((a, b) => {
            const aTime = a.messages[a.messages.length - 1]?.timestamp || a.started_at;
            const bTime = b.messages[b.messages.length - 1]?.timestamp || b.started_at;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
          });
        const seen = new Set<string>();
        const inProgress = active
          .filter((c) => {
            if (seen.has(c.course_id)) return false;
            seen.add(c.course_id);
            return true;
          })
          .slice(0, 4)
          .map((conv) => {
            const course = courseMap.get(conv.course_id);
            const lastMsg = conv.messages[conv.messages.length - 1];
            const lastUserMsg = [...conv.messages].reverse().find((m) => m.role === "user");
            const totalTopics = course?.course_outline?.length || 1;
            const coveredTopics = (conv as Record<string, unknown>).topics_covered as number[] || [];
            return {
              id: conv.id,
              course_id: conv.course_id,
              courseTitle: course?.title || "Untitled Course",
              courseCategory: course?.course_category || "general",
              messageCount: conv.messages.length,
              lastMessage: lastUserMsg?.content || lastMsg?.content || "",
              timeAgo: formatTimeAgo(lastMsg?.timestamp || conv.started_at),
              progress: Math.round((coveredTopics.length / totalTopics) * 100),
            };
          });
        setActiveSessions(inProgress);
      })
      .catch(() => setLoadError("Failed to load sessions. Please refresh."));
  }, []);

  const handleStartSession = async (courseId: string) => {
    setStartingSession(courseId);
    try {
      const conv = await apiClient.createConversation(courseId);
      router.push(`/session/${conv.id}`);
    } catch {
      router.push("/courses");
    } finally {
      setStartingSession(null);
    }
  };

  const handleEnroll = async (courseId: string) => {
    setEnrolling(courseId);
    try {
      await apiClient.enrollInCourse(courseId);
      setAvailableCourses((prev) => prev.filter((c) => c.id !== courseId));
      const enrolled = await apiClient.listMyCourses();
      setEnrolledCourses(enrolled);
    } catch (e) {
      console.error(e);
    }
    setEnrolling(null);
  };

  const firstName = learner.name?.split(" ")[0] || "there";
  const hasContent = enrolledCourses.length > 0 || availableCourses.length > 0;

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-10">
      {loadError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {loadError}
          </div>
          <button onClick={() => setLoadError(null)} className="text-destructive/60 hover:text-destructive"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Hero greeting */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-base text-muted-foreground mt-2 leading-relaxed">
          {activeSessions.length > 0
            ? "Pick up where you left off, or explore something new."
            : enrolledCourses.length > 0
              ? "Ready to learn? Jump into one of your courses."
              : "Explore available courses and start your learning journey."}
        </p>
      </motion.div>

      {/* Continue Learning — horizontal cards with progress */}
      {activeSessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-semibold text-foreground">Continue Learning</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeSessions.map((session, i) => {
              const theme = CATEGORY_THEMES[session.courseCategory] || CATEGORY_THEMES.general;
              return (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.4 }}
                >
                  <Link href={`/session/${session.id}`}>
                    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 group cursor-pointer">
                      {/* Mini gradient header */}
                      <div className={`h-2 bg-gradient-to-r ${theme.gradient}`} />
                      <div className="p-5">
                        <div className="flex items-start gap-3.5">
                          <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                            <MessageSquare className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                              {session.courseTitle}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {session.lastMessage.length > 50
                                ? session.lastMessage.slice(0, 50) + "..."
                                : session.lastMessage || "Session in progress"}
                            </p>
                            <div className="flex items-center gap-2 mt-2.5">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full bg-gradient-to-r ${theme.gradient} transition-all duration-500`}
                                  style={{ width: `${Math.max(session.progress, 8)}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {session.timeAgo}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Courses — grid with thumbnails */}
      {enrolledCourses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-semibold text-foreground">My Courses</h2>
            <Link href="/courses" className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {enrolledCourses.map((course, i) => (
              <CourseCard
                key={course.id}
                course={course}
                action="start"
                onAction={() => handleStartSession(course.id)}
                loading={startingSession === course.id}
                delay={(activeSessions.length * 0.07) + i * 0.07}
              />
            ))}
          </div>
        </div>
      )}

      {/* Browse Available — grid with thumbnails */}
      {availableCourses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-display font-semibold text-foreground">Explore Courses</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {availableCourses.map((course, i) => (
              <CourseCard
                key={course.id}
                course={course}
                action="enroll"
                onAction={() => handleEnroll(course.id)}
                loading={enrolling === course.id}
                delay={0.15 + i * 0.07}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasContent && !USE_MOCK && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="rounded-2xl border-2 border-dashed border-border/60 bg-card/50 p-16 text-center"
        >
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-foreground">No courses available yet</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
            Your organization hasn&apos;t published any courses yet. Check back soon or contact your admin.
          </p>
        </motion.div>
      )}
    </div>
  );
}
