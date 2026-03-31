"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain, TrendingUp, BarChart3, MessageSquare, BookOpen,
  Flame, GraduationCap, ChevronDown, Clock, Lightbulb,
  Target, AlertTriangle, Zap, Link2, Activity,
} from "lucide-react";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { useLearner } from "@/contexts/LearnerContext";
import { apiClient } from "@/lib/api-client";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";

const statusBadge: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  attention: "bg-warning/10 text-warning",
  proficient: "bg-success/10 text-success",
  advanced: "bg-primary/10 text-primary",
};

const modeLabel: Record<string, string> = {
  assess: "Getting Started",
  teach: "Learning",
  check_understanding: "Understanding",
  challenge: "Thinking Deeper",
  apply: "Applying",
  reflect: "Reflecting",
};

const statusLabel: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  mastered: "Mastered",
};

const statusColor: Record<string, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-primary",
  completed: "text-success",
  mastered: "text-amber-500",
};

interface LearnerInsights {
  reasoning_style?: string;
  strengths?: string[];
  gaps?: string[];
  concepts_mastered?: string[];
  concepts_struggling?: string[];
  connections_made?: string[];
  pacing?: Record<string, unknown>;
  recent_sessions?: Array<string | Record<string, unknown>>;
}

interface Analytics {
  overall: {
    total_sessions: number;
    total_messages: number;
    courses_enrolled: number;
    courses_completed: number;
    current_streak_days: number;
  };
  growth: Array<{ date: string; sessions: number; messages: number }>;
  by_course: Array<{
    course_id: string;
    course_title: string;
    sessions_completed: number;
    total_messages: number;
    topics_covered: number;
    total_topics: number;
    current_mode: string | null;
    last_session_at: string | null;
    mastery_status: string;
  }>;
  learner_insights?: LearnerInsights | null;
}

export default function AnalyticsPage() {
  const { activeCategory } = useLearner();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<string>("overall");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    apiClient.getLearnerAnalytics()
      .then(setAnalytics)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Capability radar from activeCategory (still useful)
  const radarData = activeCategory.domains.map((d) => {
    const avg = d.capabilities.reduce((s, c) => s + c.current_level, 0) / d.capabilities.length;
    const tAvg = d.capabilities.reduce((s, c) => s + c.target_level, 0) / d.capabilities.length;
    return {
      dimension: d.domain_name.split(" ")[0],
      score: +Math.min((avg / Math.max(tAvg, 0.1)) * 5, 5).toFixed(1),
      fullMark: 5,
    };
  });

  // Filter by selected course
  const selectedCourseData = analytics?.by_course.find((c) => c.course_id === selectedCourse);
  const isFiltered = selectedCourse !== "overall";

  const growthData = analytics?.growth.map((g) => ({
    date: new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    sessions: g.sessions,
    messages: g.messages,
  })) || [];

  // Filter course progress cards based on selection
  const filteredCourses = isFiltered
    ? analytics?.by_course.filter((c) => c.course_id === selectedCourse) || []
    : analytics?.by_course || [];

  const overall = analytics?.overall;
  const insights = analytics?.learner_insights;

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">
      {/* Header with course selector */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">Analytics</h1>
            <p className="text-base text-muted-foreground mt-2">Your learning progress and activity</p>
          </div>

          {/* Course selector dropdown */}
          {analytics && analytics.by_course.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                {selectedCourse === "overall"
                  ? "All Courses"
                  : analytics.by_course.find((c) => c.course_id === selectedCourse)?.course_title || "All Courses"}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[240px] rounded-xl border border-border/60 bg-card shadow-lg py-1">
                  <button
                    onClick={() => { setSelectedCourse("overall"); setDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${selectedCourse === "overall" ? "text-primary font-semibold" : "text-foreground"}`}
                  >
                    All Courses (Overall)
                  </button>
                  {analytics.by_course.map((c) => (
                    <button
                      key={c.course_id}
                      onClick={() => { setSelectedCourse(c.course_id); setDropdownOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${selectedCourse === c.course_id ? "text-primary font-semibold" : "text-foreground"}`}
                    >
                      {c.course_title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Sessions", value: selectedCourse === "overall" ? overall?.total_sessions || 0 : selectedCourseData?.sessions_completed || 0, icon: MessageSquare, color: "text-primary" },
              { label: "Messages", value: selectedCourse === "overall" ? overall?.total_messages || 0 : selectedCourseData?.total_messages || 0, icon: Brain, color: "text-violet-500" },
              { label: "Courses", value: overall?.courses_enrolled || 0, icon: BookOpen, color: "text-teal-500" },
              { label: "Day Streak", value: overall?.current_streak_days || 0, icon: Flame, color: "text-amber-500" },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.4 }}>
                <div className="rounded-2xl border border-border/60 bg-card p-5">
                  <div className="flex items-center gap-2.5 mb-3">
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                  </div>
                  <span className="text-3xl font-display font-bold text-foreground">{stat.value}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Charts row: Activity + Radar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Activity over time */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }}>
              <div className="rounded-2xl border border-border/60 bg-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <h2 className="text-base font-display font-semibold text-foreground">Activity Over Time</h2>
                  </div>
                  {isFiltered && (
                    <span className="text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full">Showing all courses</span>
                  )}
                </div>
                {growthData.length > 0 ? (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={growthData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 13, borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                        <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Messages" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                    No activity yet — start a session to see your progress here
                  </div>
                )}
              </div>
            </motion.div>

            {/* Capability Radar */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}>
              <div className="rounded-2xl border border-border/60 bg-card p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <Brain className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-display font-semibold text-foreground">Capability Radar</h2>
                </div>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="dimension" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickCount={6} />
                      <Radar dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.12} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Course progress cards */}
          {analytics && filteredCourses.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}>
              <div className="rounded-2xl border border-border/60 bg-card p-6">
                <div className="flex items-center gap-2.5 mb-5">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  <h2 className="text-base font-display font-semibold text-foreground">Course Progress</h2>
                </div>
                <div className="space-y-4">
                  {filteredCourses.map((course) => {
                    const progress = course.total_topics > 0
                      ? Math.round((course.topics_covered / course.total_topics) * 100)
                      : 0;
                    return (
                      <div key={course.course_id} className="rounded-xl border border-border/40 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-foreground">{course.course_title}</h3>
                          <span className={`text-xs font-medium ${statusColor[course.mastery_status] || "text-muted-foreground"}`}>
                            {statusLabel[course.mastery_status] || course.mastery_status}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted/70 mb-3">
                          <motion.div
                            className="h-full rounded-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.7 }}
                          />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{course.topics_covered}/{course.total_topics} topics</span>
                          <span className="h-3 w-px bg-border" />
                          <span>{course.sessions_completed} sessions</span>
                          <span className="h-3 w-px bg-border" />
                          <span>{course.total_messages} messages</span>
                          {course.current_mode && (
                            <>
                              <span className="h-3 w-px bg-border" />
                              <span className="text-primary font-medium">{modeLabel[course.current_mode] || course.current_mode}</span>
                            </>
                          )}
                          {course.last_session_at && (
                            <>
                              <span className="h-3 w-px bg-border" />
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(course.last_session_at).toLocaleDateString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* Learner Insights — AI Analysis */}
          {insights && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.4 }}>
              <div className="rounded-2xl border border-border/60 bg-card p-6">
                <div className="flex items-center gap-2.5 mb-5">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  <h2 className="text-base font-display font-semibold text-foreground">Learning Style Analysis</h2>
                </div>

                {/* Reasoning style */}
                {insights.reasoning_style && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-semibold text-foreground">Reasoning Style</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pl-6">{insights.reasoning_style}</p>
                  </div>
                )}

                {/* Strengths & Gaps side by side */}
                {(insights.strengths?.length || insights.gaps?.length) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    {insights.strengths && insights.strengths.length > 0 && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2.5">
                          <Zap className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm font-semibold text-foreground">Strengths</span>
                        </div>
                        <ul className="space-y-1.5">
                          {insights.strengths.map((s, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-emerald-500 mt-1">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {insights.gaps && insights.gaps.length > 0 && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <div className="flex items-center gap-2 mb-2.5">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <span className="text-sm font-semibold text-foreground">Areas to Improve</span>
                        </div>
                        <ul className="space-y-1.5">
                          {insights.gaps.map((g, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <span className="text-amber-500 mt-1">•</span>
                              <span>{g}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Concepts mastered & struggling */}
                {(insights.concepts_mastered?.length || insights.concepts_struggling?.length) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    {insights.concepts_mastered && insights.concepts_mastered.length > 0 && (
                      <div className="rounded-xl border border-border/40 p-4">
                        <div className="flex items-center gap-2 mb-2.5">
                          <Target className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">Concepts Mastered</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {insights.concepts_mastered.map((c, i) => (
                            <span key={i} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {insights.concepts_struggling && insights.concepts_struggling.length > 0 && (
                      <div className="rounded-xl border border-border/40 p-4">
                        <div className="flex items-center gap-2 mb-2.5">
                          <Activity className="h-4 w-4 text-orange-500" />
                          <span className="text-sm font-semibold text-foreground">Working On</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {insights.concepts_struggling.map((c, i) => (
                            <span key={i} className="text-xs bg-orange-500/10 text-orange-500 px-2.5 py-1 rounded-full font-medium">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Connections made */}
                {insights.connections_made && insights.connections_made.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Link2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">Connections Made</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {insights.connections_made.map((c, i) => (
                        <span key={i} className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pacing preferences */}
                {insights.pacing && Object.keys(insights.pacing).length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Learning Pace</span>
                    </div>
                    <div className="flex flex-wrap gap-3 pl-6">
                      {Object.entries(insights.pacing).map(([key, val]) => (
                        <div key={key} className="text-sm">
                          <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}:</span>{" "}
                          <span className="text-foreground font-medium">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent session summaries */}
                {insights.recent_sessions && insights.recent_sessions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Recent Session Takeaways</span>
                    </div>
                    <div className="space-y-2 pl-6">
                      {insights.recent_sessions.map((session, i) => (
                        <div key={i} className="text-sm text-muted-foreground leading-relaxed">
                          {typeof session === "string" ? session : (
                            <span>{(session as Record<string, unknown>).summary as string || JSON.stringify(session)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!insights.reasoning_style && !insights.strengths?.length && !insights.gaps?.length &&
                 !insights.concepts_mastered?.length && !insights.concepts_struggling?.length && (
                  <p className="text-sm text-muted-foreground">
                    Complete more sessions to build a detailed learning profile. Nexi analyzes your thinking patterns, strengths, and areas for growth as you learn.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* No insights yet — show prompt */}
          {!insights && !loading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.4 }}>
              <div className="rounded-2xl border border-border/60 bg-card p-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  <h2 className="text-base font-display font-semibold text-foreground">Learning Style Analysis</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  As you complete learning sessions, Nexi will build a detailed analysis of your reasoning style, strengths, knowledge gaps, and learning pace. Start a session to get your personalized insights.
                </p>
              </div>
            </motion.div>
          )}

          {/* Domain Capability Breakdown */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.4 }}>
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h2 className="text-base font-display font-semibold text-foreground">Capability Breakdown</h2>
              </div>
              <div className="space-y-6">
                {activeCategory.domains.map((domain) => {
                  const avgProgress = Math.round(domain.capabilities.reduce((s, c) => s + c.progress, 0) / domain.capabilities.length);
                  return (
                    <div key={domain.id}>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-foreground">{domain.domain_name}</span>
                        <span className="text-sm font-semibold text-foreground">{avgProgress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted/70 mb-3">
                        <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${avgProgress}%` }} transition={{ duration: 0.7 }} />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {domain.capabilities.map((cap) => (
                          <div key={cap.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ProgressCircle value={cap.progress} size={30} strokeWidth={2.5} showLabel={false} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{cap.name}</p>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[cap.status]}`}>
                                  {cap.progress}%
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
