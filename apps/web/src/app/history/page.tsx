"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Clock, CheckCircle2, Play, BookOpen,
  ArrowRight, ChevronDown, ChevronUp, Layers,
} from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { USE_MOCK } from "@/lib/auth";

interface SessionEntry {
  id: string;
  course_id: string;
  courseTitle: string;
  messageCount: number;
  started_at: string;
  ended_at: string | null;
  lastMessage: string;
  status: "completed" | "in_progress";
}

interface CourseGroup {
  course_id: string;
  courseTitle: string;
  sessions: SessionEntry[];
  totalMessages: number;
  latestSession: SessionEntry;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "Ongoing";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

function groupByCourse(sessions: SessionEntry[]): CourseGroup[] {
  const map = new Map<string, SessionEntry[]>();
  for (const s of sessions) {
    const existing = map.get(s.course_id) || [];
    existing.push(s);
    map.set(s.course_id, existing);
  }

  return Array.from(map.entries()).map(([course_id, courseSessions]) => {
    // Sort by most recent first
    courseSessions.sort((a, b) => {
      const aTime = a.ended_at || a.started_at;
      const bTime = b.ended_at || b.started_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    return {
      course_id,
      courseTitle: courseSessions[0].courseTitle,
      sessions: courseSessions,
      totalMessages: courseSessions.reduce((sum, s) => sum + s.messageCount, 0),
      latestSession: courseSessions[0],
    };
  }).sort((a, b) => {
    const aTime = a.latestSession.ended_at || a.latestSession.started_at;
    const bTime = b.latestSession.ended_at || b.latestSession.started_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (USE_MOCK) {
      setLoading(false);
      return;
    }

    Promise.all([apiClient.listConversations(), apiClient.listMyCourses()])
      .then(([conversations, courses]) => {
        const courseMap = new Map(courses.map((c) => [c.id, c.title]));

        const entries: SessionEntry[] = conversations
          .filter((c) => c.messages && c.messages.length > 0)
          .sort((a, b) => {
            const aTime = a.ended_at || a.messages[a.messages.length - 1]?.timestamp || a.started_at;
            const bTime = b.ended_at || b.messages[b.messages.length - 1]?.timestamp || b.started_at;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
          })
          .map((conv) => {
            const lastMsg = conv.messages[conv.messages.length - 1];
            const lastUserMsg = [...conv.messages].reverse().find((m) => m.role === "user");
            return {
              id: conv.id,
              course_id: conv.course_id,
              courseTitle: courseMap.get(conv.course_id) || "Untitled Course",
              messageCount: conv.messages.length,
              started_at: conv.started_at,
              ended_at: conv.ended_at,
              lastMessage: lastUserMsg?.content || lastMsg?.content || "",
              status: conv.ended_at ? "completed" as const : "in_progress" as const,
            };
          });

        setSessions(entries);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleCourse = (courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-muted/70" />
      </div>
    );
  }

  const inProgressSessions = sessions.filter((s) => s.status === "in_progress");
  const completedSessions = sessions.filter((s) => s.status === "completed");
  const inProgressGroups = groupByCourse(inProgressSessions);
  const completedGroups = groupByCourse(completedSessions);

  return (
    <div className="px-8 py-8 max-w-4xl mx-auto space-y-10">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">Session History</h1>
        <p className="text-base text-muted-foreground mt-2">
          Review your learning sessions and pick up where you left off.
        </p>
      </motion.div>

      {/* In-progress sessions — grouped by course */}
      {inProgressGroups.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-4">
            In progress ({inProgressGroups.length} {inProgressGroups.length === 1 ? "course" : "courses"})
          </h2>
          <div className="space-y-3">
            {inProgressGroups.map((group, i) => {
              const isExpanded = expandedCourses.has(group.course_id);
              const hasMultiple = group.sessions.length > 1;

              return (
                <motion.div
                  key={group.course_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                >
                  {/* Primary card — latest session for this course */}
                  <Link href={`/session/${group.latestSession.id}`}>
                    <div className="rounded-2xl bg-card border border-border/60 p-5 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 group cursor-pointer">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0">
                            <MessageSquare className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                              {group.courseTitle}
                            </h3>
                            <div className="flex items-center gap-2.5 mt-1">
                              <span className="text-sm text-muted-foreground">
                                {group.totalMessages} messages
                              </span>
                              {hasMultiple && (
                                <>
                                  <span className="text-muted-foreground/30">·</span>
                                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                                    <Layers className="h-3.5 w-3.5" />
                                    {group.sessions.length} sessions
                                  </span>
                                </>
                              )}
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDate(group.latestSession.started_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {hasMultiple && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCourse(group.course_id); }}
                              className="p-2 rounded-lg hover:bg-muted/80 transition-colors text-muted-foreground"
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          )}
                          <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 text-primary px-4 py-2.5 text-sm font-medium group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                            <Play className="h-4 w-4" /> Continue
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Expandable older sessions */}
                  <AnimatePresence>
                    {isExpanded && hasMultiple && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-8 mt-1 space-y-1 border-l-2 border-border/40 pl-4">
                          {group.sessions.slice(1).map((session) => (
                            <Link key={session.id} href={`/session/${session.id}`}>
                              <div className="rounded-xl bg-muted/30 border border-border/30 p-3 hover:bg-muted/60 transition-all cursor-pointer">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <span>{session.messageCount} messages</span>
                                    <span className="text-muted-foreground/30">·</span>
                                    <span>{formatDate(session.started_at)}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground hover:text-primary transition-colors">
                                    Resume
                                  </span>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed sessions — grouped by course */}
      {completedGroups.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-4">
            Completed ({completedGroups.length} {completedGroups.length === 1 ? "course" : "courses"})
          </h2>
          <div className="space-y-3">
            {completedGroups.map((group, i) => {
              const isExpanded = expandedCourses.has(`completed-${group.course_id}`);
              const hasMultiple = group.sessions.length > 1;

              return (
                <motion.div
                  key={group.course_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (inProgressGroups.length * 0.05) + i * 0.05, duration: 0.4 }}
                >
                  <Link href={`/session/${group.latestSession.id}`}>
                    <div className="rounded-2xl bg-card border border-border/60 p-5 hover:border-success/30 hover:shadow-md hover:shadow-success/5 transition-all duration-200 group cursor-pointer">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="h-11 w-11 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-base font-semibold text-foreground group-hover:text-success transition-colors">
                              {group.courseTitle}
                            </h3>
                            <div className="flex items-center gap-2.5 mt-1">
                              <span className="text-sm text-muted-foreground">
                                {group.totalMessages} messages
                              </span>
                              {hasMultiple && (
                                <>
                                  <span className="text-muted-foreground/30">·</span>
                                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                                    <Layers className="h-3.5 w-3.5" />
                                    {group.sessions.length} sessions
                                  </span>
                                </>
                              )}
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-sm text-muted-foreground">
                                {formatDuration(group.latestSession.started_at, group.latestSession.ended_at)}
                              </span>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-sm text-muted-foreground">
                                {formatDate(group.latestSession.ended_at || group.latestSession.started_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {hasMultiple && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCourse(`completed-${group.course_id}`); }}
                              className="p-2 rounded-lg hover:bg-muted/80 transition-colors text-muted-foreground"
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          )}
                          <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                            Review <ArrowRight className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>

                  <AnimatePresence>
                    {isExpanded && hasMultiple && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-8 mt-1 space-y-1 border-l-2 border-border/40 pl-4">
                          {group.sessions.slice(1).map((session) => (
                            <Link key={session.id} href={`/session/${session.id}`}>
                              <div className="rounded-xl bg-muted/30 border border-border/30 p-3 hover:bg-muted/60 transition-all cursor-pointer">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <span>{session.messageCount} messages</span>
                                    <span className="text-muted-foreground/30">·</span>
                                    <span>{formatDuration(session.started_at, session.ended_at)}</span>
                                    <span className="text-muted-foreground/30">·</span>
                                    <span>{formatDate(session.ended_at || session.started_at)}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground hover:text-success transition-colors">
                                    Review
                                  </span>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sessions.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="rounded-2xl border-2 border-dashed border-border/60 bg-card/50 p-12 text-center"
        >
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No sessions yet</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
            Start your first learning session from the courses page.
          </p>
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            Browse Courses <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      )}
    </div>
  );
}
