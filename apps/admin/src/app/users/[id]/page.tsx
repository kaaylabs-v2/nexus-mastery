"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft, BookOpen, MessageSquare, Clock, Target,
  Brain, Zap, TrendingUp, Lightbulb, ChevronRight,
} from "lucide-react";
import { adminApi, type LearnerDetail } from "@/lib/api-client";

const masteryStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-gray-100", text: "text-gray-600", label: "Not Started" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-600", label: "In Progress" },
  mastery_achieved: { bg: "bg-emerald-50", text: "text-emerald-600", label: "Mastered" },
  not_achieved: { bg: "bg-amber-50", text: "text-amber-600", label: "Needs Work" },
};

const modeLabels: Record<string, string> = {
  assess: "Assessment",
  teach: "Learning",
  check_understanding: "Review",
  challenge: "Challenge",
  apply: "Application",
  reflect: "Reflection",
};

export default function LearnerDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const [learner, setLearner] = useState<LearnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    adminApi.getLearnerDetail(userId)
      .then(setLearner)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !learner) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link href="/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Learners
        </Link>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="text-sm text-destructive">{error || "Learner not found"}</p>
        </div>
      </div>
    );
  }

  const profile = learner.mastery_profile;

  // Extract and type JSONB fields for safe rendering
  const tp = (profile?.thinking_patterns || {}) as Record<string, string | string[]>;
  const kg = (profile?.knowledge_graph || {}) as Record<string, string | string[]>;
  const pp = (profile?.pacing_preferences || {}) as Record<string, string>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">

        {/* Back link */}
        <Link href="/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Learners
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xl font-bold text-primary">
              {(learner.display_name || learner.email)[0].toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground tracking-tight">
              {learner.display_name || learner.email.split("@")[0]}
            </h1>
            <p className="text-sm text-muted-foreground">{learner.email}</p>
          </div>
          <div className="ml-auto text-right">
            <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium capitalize">
              {learner.role.replace("_", " ")}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Joined {new Date(learner.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-[18px] w-[18px] text-primary" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-foreground">{learner.stats.courses_enrolled}</p>
            <p className="text-xs text-muted-foreground">Courses Enrolled</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-[18px] w-[18px] text-primary" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-foreground">{learner.stats.total_sessions}</p>
            <p className="text-xs text-muted-foreground">Total Sessions</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-[18px] w-[18px] text-primary" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-foreground">{learner.stats.total_messages}</p>
            <p className="text-xs text-muted-foreground">Messages Exchanged</p>
          </div>
        </div>

        {/* Two-column: Learning Profile + Courses */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Learning Profile (wider) */}
          <div className="lg:col-span-3 space-y-5">

            {profile ? (
              <>
                {/* Learning Style */}
                {(tp.reasoning_style || tp.strengths || tp.gaps) && (
                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Learning Style</h2>
                    </div>

                    {tp.reasoning_style && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Reasoning Style</p>
                        <p className="text-sm text-foreground">{String(tp.reasoning_style)}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {tp.strengths && Array.isArray(tp.strengths) && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Strengths</p>
                          <div className="space-y-1">
                            {(tp.strengths as string[]).map((s: string, i: number) => (
                              <div key={i} className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-sm text-foreground">{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {tp.gaps && Array.isArray(tp.gaps) && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Growth Areas</p>
                          <div className="space-y-1">
                            {(tp.gaps as string[]).map((g: string, i: number) => (
                              <div key={i} className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                <span className="text-sm text-foreground">{g}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Knowledge Graph */}
                {(kg.demonstrated_concepts || kg.struggling_areas || kg.connections_made) && (
                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Knowledge Map</h2>
                    </div>

                    {kg.demonstrated_concepts && Array.isArray(kg.demonstrated_concepts) && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Concepts Mastered</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(kg.demonstrated_concepts as string[]).map((c: string) => (
                            <span key={c} className="rounded-full bg-emerald-50 text-emerald-600 px-2.5 py-1 text-xs font-medium">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {kg.struggling_areas && Array.isArray(kg.struggling_areas) && (kg.struggling_areas as string[]).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Needs Reinforcement</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(kg.struggling_areas as string[]).map((c: string) => (
                            <span key={c} className="rounded-full bg-amber-50 text-amber-600 px-2.5 py-1 text-xs font-medium">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {kg.connections_made && Array.isArray(kg.connections_made) && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Connections Made</p>
                        <div className="space-y-1.5">
                          {(kg.connections_made as string[]).map((c: string, i: number) => (
                            <div key={i} className="flex items-start gap-2">
                              <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                              <span className="text-sm text-foreground">{c}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Pacing Preferences */}
                {Object.keys(pp).length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Pacing Preferences</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {pp.optimal_session_length && (
                        <div>
                          <p className="text-xs text-muted-foreground">Optimal Session Length</p>
                          <p className="text-sm font-medium text-foreground mt-0.5">{String(pp.optimal_session_length)}</p>
                        </div>
                      )}
                      {pp.preferred_difficulty && (
                        <div>
                          <p className="text-xs text-muted-foreground">Preferred Difficulty</p>
                          <p className="text-sm font-medium text-foreground mt-0.5 capitalize">{String(pp.preferred_difficulty)}</p>
                        </div>
                      )}
                      {pp.response_depth && (
                        <div>
                          <p className="text-xs text-muted-foreground">Response Depth</p>
                          <p className="text-sm font-medium text-foreground mt-0.5 capitalize">{String(pp.response_depth)}</p>
                        </div>
                      )}
                      {pp.engagement_pattern && (
                        <div>
                          <p className="text-xs text-muted-foreground">Engagement Pattern</p>
                          <p className="text-sm font-medium text-foreground mt-0.5 capitalize">{String(pp.engagement_pattern)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Session Summaries */}
                {profile.conversation_summary && profile.conversation_summary.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-foreground">Recent Session Notes</h2>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {profile.conversation_summary.slice(-5).reverse().map((summary, i) => (
                        <div key={i} className="rounded-lg bg-muted/30 p-3">
                          {summary.date ? <p className="text-xs text-muted-foreground mb-1">{String(summary.date)}</p> : null}
                          <p className="text-sm text-foreground">{String(summary.summary || summary.content || JSON.stringify(summary))}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <Brain className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No learning profile yet</p>
                <p className="text-xs text-muted-foreground mt-1">A profile will be built as this learner completes sessions with Nexi</p>
              </div>
            )}
          </div>

          {/* Course Enrollments (narrower) */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-sm font-semibold text-foreground">Courses</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{learner.enrollments.length} enrolled</p>
              </div>

              {learner.enrollments.length > 0 ? (
                <div className="divide-y divide-border">
                  {learner.enrollments.map((enr) => {
                    const status = masteryStatusColors[enr.mastery_status] || masteryStatusColors.not_started;
                    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                    const thumb = enr.thumbnail_url
                      ? (enr.thumbnail_url.startsWith("http") ? enr.thumbnail_url : `${apiBase}${enr.thumbnail_url}`)
                      : null;

                    return (
                      <div key={enr.course_id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start gap-3">
                          {thumb ? (
                            <img src={thumb} alt="" className="h-10 w-14 rounded-md object-cover shrink-0" />
                          ) : (
                            <div className="h-10 w-14 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                              <BookOpen className="h-4 w-4 text-primary/40" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground line-clamp-1">{enr.course_title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}>
                                {status.label}
                              </span>
                              {enr.current_mode && (
                                <span className="text-xs text-muted-foreground">
                                  {modeLabels[enr.current_mode] || enr.current_mode}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span>{enr.session_count} session{enr.session_count !== 1 ? "s" : ""}</span>
                              {enr.last_session_at && (
                                <span>Last: {new Date(enr.last_session_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Not enrolled in any courses yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
