"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Lightbulb, Layout, HelpCircle, Check, ChevronDown, X, Volume2, VolumeX, CheckCircle2, BookOpen, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionStepper } from "@/components/ui/session-stepper";
import { InsightBanner } from "@/components/ui/insight-banner";
import { useArenaSocket } from "@/hooks/useArenaSocket";
import { useVoice } from "@/hooks/useVoice";
import { arenaSession, getStageLabel, type SessionStage } from "@/lib/mock-data";
import { USE_MOCK } from "@/lib/auth";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";
import { DataChart } from "@/components/ui/data-chart";
import { ComparisonTable } from "@/components/ui/comparison-table";
import { getStudioPanel, type CourseCategory } from "@/components/session/studio-panels";
import { PlacementQuiz, type QuizQuestion, type QuizResult } from "@/components/session/placement-quiz";

const MermaidDiagram = dynamic(
  () => import("@/components/ui/mermaid-diagram").then((m) => m.MermaidDiagram),
  { ssr: false }
);

type StageKey = "assess" | "teach" | "check_understanding" | "challenge" | "apply" | "reflect";

const stages: { key: StageKey; label: string }[] = [
  { key: "assess", label: "Getting Started" },
  { key: "teach", label: "Learn" },
  { key: "check_understanding", label: "Understand" },
  { key: "challenge", label: "Think Deeper" },
  { key: "apply", label: "Apply" },
  { key: "reflect", label: "Reflect" },
];

const stageColors: Record<StageKey, string> = {
  assess: "hsl(280 50% 55%)",
  teach: "hsl(var(--primary))",
  check_understanding: "hsl(var(--warning))",
  challenge: "hsl(var(--info))",
  apply: "hsl(270 60% 55%)",
  reflect: "hsl(var(--success))",
};

const STORAGE_KEY = "arena-session-notes";

function loadNotes(): Record<string, string> {
  if (typeof window === "undefined") return { assumptions: "", evidence: "", alternatives: "", notes: "" };
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
  return { assumptions: "", evidence: "", alternatives: "", notes: "" };
}

const stageInsights: Record<string, { insight: string; prompts: string[] }> = {
  assess: {
    insight: "Nexi is getting to know what you already know. Just share what comes to mind — no right or wrong answers!",
    prompts: ["What do you already know about this topic?", "Have you had any hands-on experience with it?", "What are you hoping to learn?"],
  },
  teach: {
    insight: "Nexi is explaining the concept. Follow along and ask questions if anything is unclear.",
    prompts: ["What's the key idea being explained?", "How does this connect to what you already know?", "Is there a part you'd like clarified?"],
  },
  check_understanding: {
    insight: "Time to check your understanding. Try to explain the concept in your own words.",
    prompts: ["Can you summarize the main point?", "What's a real-world example of this?", "What part feels clearest to you?"],
  },
  challenge: {
    insight: "Nexi is pushing your thinking deeper. Consider edge cases and counterarguments.",
    prompts: ["What assumptions are you making?", "What would happen if the situation were different?", "Are there exceptions to this?"],
  },
  apply: {
    insight: "Time to apply what you've learned to a realistic scenario.",
    prompts: ["What's your first instinct? Why?", "What information do you need to make a good decision?", "What tradeoffs are involved?"],
  },
  reflect: {
    insight: "Reflect on what you've learned. What will you take away from this session?",
    prompts: ["What's the most important thing you learned?", "What would you do differently next time?", "How does this connect to previous sessions?"],
  },
};

function getAutoReadPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const val = localStorage.getItem("arena-auto-read");
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

function NexiAvatar() {
  return (
    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-violet-400 flex items-center justify-center shrink-0 shadow-sm">
      <span className="text-xs font-bold text-white">N</span>
    </div>
  );
}

export default function ArenaSessionPage() {
  const params = useParams();
  const [courseInfo, setCourseInfo] = useState<{ title: string; description: string } | null>(null);
  const [courseCategory, setCourseCategory] = useState<CourseCategory>("general");
  const [inputMessage, setInputMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"assumptions" | "evidence" | "alternatives" | "notes">("assumptions");
  const [notes, setNotes] = useState<Record<string, string>>(loadNotes);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [autoRead, setAutoRead] = useState(getAutoReadPref);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [assessment, setAssessment] = useState<Record<string, unknown> | null>(null);
  const [completing, setCompleting] = useState(false);
  // Quiz state
  const [quizPhase, setQuizPhase] = useState<"loading" | "taking" | "done" | "skipped">("loading");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const courseIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { messages: liveMessages, isStreaming, streamingContent, scaffold, currentMode, lastEvaluation, sendMessage, connect, courseOutline, currentTopicId, topicsCovered, loadExistingMessages } = useArenaSocket();

  // Voice mode: when enabled, auto-records → VAD detects silence → sends to STT → sends message → TTS plays → auto-records again
  const voiceModeRef = useRef(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const handleVoiceBlob = useCallback(async (blob: Blob) => {
    if (blob.size === 0) return;
    setIsTranscribing(true);
    try {
      const { apiClient } = await import("@/lib/api-client");
      const transcript = await apiClient.speechToText(blob);
      if (transcript.trim()) {
        sendMessage(transcript.trim());
      } else if (voiceModeRef.current) {
        // No speech detected — re-listen
        setTimeout(() => { if (voiceModeRef.current) voiceStartRecording(); }, 300);
      }
    } catch (err) {
      console.error("[STT] Transcription failed:", err);
    }
    setIsTranscribing(false);
  }, [sendMessage]);

  const voiceStartRecordingRef = useRef<() => void>(() => {});

  const handlePlaybackEnded = useCallback(() => {
    // After Nexi finishes speaking, auto-listen if voice mode is on
    if (voiceModeRef.current) {
      setTimeout(() => {
        if (voiceModeRef.current) voiceStartRecordingRef.current();
      }, 400); // Small pause before listening again
    }
  }, []);

  const { isRecording, startRecording: voiceStartRecording, stopRecording, isPlaying: ttsPlaying, playAudioBuffer, stopAudio: stopTTSAudio, voiceMode, setVoiceMode, audioLevel } = useVoice({
    onSilenceDetected: handleVoiceBlob,
    onPlaybackEnded: handlePlaybackEnded,
  });

  // Keep ref updated so handlePlaybackEnded always has the latest function
  useEffect(() => { voiceStartRecordingRef.current = voiceStartRecording; }, [voiceStartRecording]);

  // Connect — create a real conversation for the course, but show quiz first for new sessions
  useEffect(() => {
    const id = params?.id as string;
    if (!id) return;

    const url = new URL(window.location.href);
    const courseId = url.searchParams.get("course");

    import("@/lib/api-client").then(({ apiClient }) => {
      if (courseId) {
        courseIdRef.current = courseId;

        // Fetch course info
        apiClient.listCourses().then((courses) => {
          const course = courses.find((c) => c.id === courseId);
          if (course) {
            setCourseInfo({ title: course.title, description: course.description });
            if (course.course_category) setCourseCategory(course.course_category as CourseCategory);
          }
        }).catch(() => {});

        // Create or reuse conversation
        apiClient.createConversation(courseId).then((conv) => {
          conversationIdRef.current = conv.id;

          // If the backend returned an existing session with messages, resume it
          if (conv.messages && conv.messages.length > 0) {
            loadExistingMessages(conv.messages, (conv as Record<string, unknown>).session_mode as string);
            setQuizPhase("skipped");
            connect(conv.id);
            return;
          }

          // New session — try placement quiz
          apiClient.getPlacementQuiz(courseId).then((quiz) => {
            if (quiz.questions && quiz.questions.length > 0) {
              setQuizTitle(quiz.quiz_title);
              setQuizQuestions(quiz.questions);
              setQuizPhase("taking");
            } else {
              setQuizPhase("skipped");
              connect(conv.id);
            }
          }).catch(() => {
            setQuizPhase("skipped");
            connect(conv.id);
          });
        }).catch(() => { conversationIdRef.current = id; });

      } else if (id.includes("-") && id.length > 30) {
        // Resuming an existing conversation — skip quiz
        setQuizPhase("skipped");
        conversationIdRef.current = id;
        apiClient.getConversation(id).then((conv) => {
          if (conv.messages && conv.messages.length > 0) {
            loadExistingMessages(conv.messages, conv.session_mode);
          }
          if (conv.course_id) {
            apiClient.listCourses().then((courses) => {
              const course = courses.find((c) => c.id === conv.course_id);
              if (course) {
                setCourseInfo({ title: course.title, description: course.description });
                if (course.course_category) setCourseCategory(course.course_category as CourseCategory);
              }
            }).catch(() => {});
          }
          connect(id);
        }).catch(() => {
          connect(id);
        });
      } else {
        setQuizPhase("skipped");
        conversationIdRef.current = id;
        connect(id);
      }
    });
  }, [params?.id, connect, loadExistingMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [liveMessages, streamingContent]);

  // Auto-read ALL Nexi messages when voice is on
  useEffect(() => {
    if (!autoRead) return;
    const lastMsg = liveMessages[liveMessages.length - 1];
    if (!lastMsg || lastMsg.role !== "nexi") return;
    if (playingMsgId === lastMsg.id) return;
    playTTS(lastMsg.id, lastMsg.content);
  }, [liveMessages, autoRead]); // eslint-disable-line react-hooks/exhaustive-deps

  const playTTS = useCallback(async (msgId: string, text: string) => {
    try {
      setPlayingMsgId(msgId);
      const { apiClient } = await import("@/lib/api-client");
      const audioBuffer = await apiClient.textToSpeech(text);
      await playAudioBuffer(audioBuffer);
      setPlayingMsgId(null);
    } catch (err) {
      console.error("[TTS] Voice playback failed:", err);
      setPlayingMsgId(null);
      // Re-activate mic if in voice mode so the loop doesn't die
      if (voiceModeRef.current) {
        setTimeout(() => voiceStartRecordingRef.current(), 400);
      }
    }
  }, [playAudioBuffer]);

  const stopTTS = useCallback(() => {
    stopTTSAudio();
    setPlayingMsgId(null);
  }, [stopTTSAudio]);

  const toggleAutoRead = useCallback(() => {
    setAutoRead((prev) => {
      const next = !prev;
      localStorage.setItem("arena-auto-read", String(next));
      if (!next) stopTTS();
      return next;
    });
  }, [stopTTS]);

  // Keep voiceModeRef in sync
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  // Enter/exit voice mode
  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      // Exit voice mode
      setVoiceMode(false);
      stopTTS();
    } else {
      // Enter voice mode — enable auto-read and start listening
      setVoiceMode(true);
      setAutoRead(true);
      localStorage.setItem("arena-auto-read", "true");
      // Start listening immediately
      setTimeout(() => voiceStartRecording(), 200);
    }
  }, [voiceMode, setVoiceMode, stopTTS, voiceStartRecording]);

  const handleFinishSession = useCallback(async () => {
    const convId = conversationIdRef.current;
    if (!convId || completing) return;
    setCompleting(true);
    try {
      const { apiClient } = await import("@/lib/api-client");
      const result = await apiClient.completeSession(convId);
      setSessionComplete(true);
      if (result.assessment) setAssessment(result.assessment as Record<string, unknown>);
    } catch (e) {
      console.error("Failed to complete session:", e);
    }
    setCompleting(false);
  }, [completing]);

  // Quiz handlers
  const handleQuizComplete = useCallback(async (answers: Record<string, string>) => {
    const cid = courseIdRef.current;
    if (!cid) return;
    setQuizSubmitting(true);
    try {
      const { apiClient } = await import("@/lib/api-client");
      const result = await apiClient.submitQuiz(cid, {
        answers,
        questions: quizQuestions as unknown as Array<Record<string, unknown>>,
      });
      setQuizResult(result);
      setQuizPhase("done");
    } catch (e) {
      console.error("Quiz submission failed:", e);
      handleQuizSkip();
    }
    setQuizSubmitting(false);
  }, [quizQuestions]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuizSkip = useCallback(() => {
    setQuizPhase("skipped");
    const convId = conversationIdRef.current;
    if (convId) connect(convId);
  }, [connect]);

  const handleQuizStartLearning = useCallback(() => {
    setQuizPhase("skipped");
    const convId = conversationIdRef.current;
    if (convId && quizResult) {
      connect(convId, {
        teach_depth: quizResult.teach_depth,
        skip_to_mode: quizResult.skip_to_mode,
        familiarity: quizResult.familiarity,
        percentage: quizResult.percentage,
      });
    } else if (convId) {
      connect(convId);
    }
  }, [connect, quizResult]);

  const handleNoteChange = useCallback((tab: string, value: string) => {
    setNotes((prev) => {
      const next = { ...prev, [tab]: value };
      setSaveStatus("saving");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }, 1500);
      return next;
    });
  }, []);

  const isRealSession = conversationIdRef.current && conversationIdRef.current.includes("-") && conversationIdRef.current.length > 30;
  const allMessages = isRealSession
    ? liveMessages
    : [...arenaSession.messages.map((m) => ({ ...m, role: m.role as "nexi" | "user" })), ...liveMessages];
  const activeStage = (currentMode as StageKey) || "assess";
  const exchangeCount = liveMessages.filter((m) => m.role === "user").length;
  const totalPhases = stages.length;
  const currentPhaseIndex = stages.findIndex((s) => s.key === activeStage);
  const scorePercent = courseOutline.length > 0
    ? Math.min(Math.round((topicsCovered.length / courseOutline.length) * 100), 100)
    : Math.min(Math.round(((currentPhaseIndex + 1) / totalPhases) * 100), 100);
  const currentInsight = stageInsights[activeStage] || stageInsights.teach;
  const scaffoldObservation = scaffold?.observation || currentInsight.insight;
  const scaffoldPrompts = scaffold?.consider || currentInsight.prompts;

  const handleSend = () => {
    if (!inputMessage.trim() || isStreaming) return;
    sendMessage(inputMessage.trim());
    setInputMessage("");
  };

  const handleMic = async () => {
    if (isRecording) {
      // Manual stop — transcribe the recording
      const blob = await stopRecording();
      if (blob && blob.size > 0) {
        await handleVoiceBlob(blob);
      }
    } else {
      stopTTS();
      await voiceStartRecording();
    }
  };

  // ─── Quiz Phase ─────────────────────────────────────────────────────────
  if (quizPhase === "loading") {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-violet-400 flex items-center justify-center animate-pulse">
            <span className="text-lg font-bold text-white">N</span>
          </div>
          <p className="text-sm text-muted-foreground">Preparing your session...</p>
        </div>
      </div>
    );
  }

  if (quizPhase === "taking" || quizPhase === "done") {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center bg-background">
        <PlacementQuiz
          quizTitle={quizTitle}
          questions={quizQuestions}
          courseTitle={courseInfo?.title || "this course"}
          onComplete={handleQuizComplete}
          onSkip={quizPhase === "done" ? handleQuizStartLearning : handleQuizSkip}
          isSubmitting={quizSubmitting}
          result={quizResult}
        />
      </div>
    );
  }

  // ─── Main Session UI (quizPhase === "skipped") ────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left Panel — Course Info */}
      <div className="w-[280px] shrink-0 overflow-y-auto border-r border-border/60 bg-surface/50 px-5 py-6 scrollbar-none">
        <div className="mb-5">
          <div className="flex items-start gap-3 mb-1">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-display font-semibold text-foreground leading-snug">
                {courseInfo?.title || arenaSession.title}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {courseInfo?.description || arenaSession.description}
              </p>
            </div>
          </div>
        </div>

        <div className="my-5 border-t border-border/50" />

        {courseOutline.length > 0 ? (
          <div className="mb-5">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Course progress ({topicsCovered.length}/{courseOutline.length})
            </p>

            <div className="mb-5">
              <div className="h-2.5 overflow-hidden rounded-full bg-muted/70">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${Math.round((topicsCovered.length / courseOutline.length) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {Math.round((topicsCovered.length / courseOutline.length) * 100)}% complete
              </p>
            </div>

            <div className="space-y-2">
              {courseOutline.map((section) => {
                const isCovered = topicsCovered.includes(section.id);
                const isCurrent = section.id === currentTopicId;

                return (
                  <div key={section.id} className={cn(
                    "flex items-start gap-3 rounded-xl p-2.5 transition-colors",
                    isCurrent ? "bg-primary/5 border border-primary/15" : ""
                  )}>
                    <div className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5",
                      isCovered ? "bg-primary text-primary-foreground" :
                      isCurrent ? "border-2 border-primary text-primary ring-2 ring-primary/15" :
                      "border-2 border-muted-foreground/25 text-muted-foreground/40"
                    )}>
                      {isCovered ? <Check className="h-3.5 w-3.5" /> : section.id}
                    </div>
                    <div className="min-w-0">
                      <span className={cn(
                        "text-sm leading-snug block",
                        isCurrent ? "font-semibold text-foreground" :
                        isCovered ? "text-muted-foreground line-through" :
                        "text-muted-foreground/40"
                      )}>
                        {section.title}
                      </span>
                      {isCurrent && section.description && (
                        <span className="text-sm text-muted-foreground mt-0.5 block leading-relaxed">
                          {section.description}
                        </span>
                      )}
                      {section.visuals && section.visuals.length > 0 && (
                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-primary/60">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 15l5-5 4 4 8-8" />
                          </svg>
                          {section.visuals.length} visual{section.visuals.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <p className="text-sm font-medium text-muted-foreground mb-4">Session phases</p>
            <div className="space-y-3">
              {stages.map((stage, i) => {
                const isCurrent = stage.key === activeStage;
                const isPast = stages.findIndex((s) => s.key === activeStage) > i;
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors",
                      isPast ? "bg-primary border-primary text-primary-foreground" :
                      isCurrent ? "border-primary text-primary ring-2 ring-primary/15" :
                      "border-muted-foreground/25 text-muted-foreground/40"
                    )}>
                      {isPast ? "✓" : i + 1}
                    </div>
                    <span className={cn(
                      "text-sm",
                      isCurrent ? "font-semibold text-foreground" : isPast ? "text-muted-foreground" : "text-muted-foreground/40"
                    )}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isRealSession && (
          <div className="text-sm text-muted-foreground/40 italic">Demo session — mock data</div>
        )}
      </div>

      {/* Center Panel — Chat */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center gap-2.5 border-b border-border/60 bg-card px-5 py-3.5">
          {stages.map((stage) => {
            const isActive = stage.key === activeStage;
            return (
              <span key={stage.key} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium transition-all", isActive ? "text-white shadow-sm" : "bg-muted/70 text-muted-foreground")}
                style={isActive ? { backgroundColor: stageColors[stage.key] } : undefined}>
                {stage.label}
              </span>
            );
          })}
          {courseOutline.length > 0 && currentTopicId && (
            <>
              <span className="h-4 w-px bg-border/60" />
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                {courseOutline.find(s => s.id === currentTopicId)?.title || ""}
              </span>
            </>
          )}

          <div className="ml-auto flex items-center gap-3">
            <button onClick={toggleAutoRead}
              title={autoRead ? "Voice is on — click to mute" : "Voice is off — click to unmute"}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                autoRead ? "bg-primary/10 text-primary" : "bg-muted/70 text-muted-foreground hover:text-foreground"
              )}>
              {autoRead ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {autoRead ? "Voice On" : "Voice Off"}
            </button>
            <span className="text-sm text-muted-foreground">Score</span>
            <span className="text-base font-semibold text-primary">{scorePercent}%</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 scrollbar-none scroll-smooth bg-background">
          {allMessages.map((msg) => {
            // Check if this is a visual message
            let visualData: Record<string, unknown> | null = null;
            try {
              const parsed = JSON.parse(msg.content);
              if (parsed._visual) visualData = parsed;
            } catch { /* not JSON — regular message */ }

            if (visualData) {
              const vType = visualData.type as string;
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-[80%]">
                  {vType === "mermaid" && visualData.content ? (
                    <MermaidDiagram content={visualData.content as string} title={visualData.title as string} caption={visualData.caption as string} />
                  ) : vType === "chart" && visualData.data ? (
                    <DataChart chart_type={(visualData.chart_type as "bar" | "pie" | "line") || "bar"} data={visualData.data as Array<{ name: string; value: number }>} title={visualData.title as string} caption={visualData.caption as string} />
                  ) : vType === "table" && visualData.headers && visualData.rows ? (
                    <ComparisonTable headers={visualData.headers as string[]} rows={visualData.rows as string[][]} title={visualData.title as string} caption={visualData.caption as string} />
                  ) : null}
                </motion.div>
              );
            }

            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}
                className={cn(
                  msg.role === "user"
                    ? "ml-auto flex flex-col items-end max-w-[70%]"
                    : "max-w-[70%]"
                )}>
                <div className={cn("rounded-2xl relative group/msg",
                  msg.role === "nexi"
                    ? "bg-card border border-border/50 text-foreground shadow-sm px-6 py-5 font-display"
                    : "bg-primary/10 border border-primary/15 text-foreground w-fit px-5 py-4 text-sm leading-relaxed"
                )}>
                  {msg.role === "nexi" && (
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-2.5">
                        <NexiAvatar />
                        <span className="text-sm font-semibold text-primary">Nexi</span>
                      </div>
                      {playingMsgId === msg.id ? (
                        <button onClick={stopTTS} className="text-primary animate-pulse" title="Stop">
                          <Volume2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <button onClick={() => playTTS(msg.id, msg.content)}
                          className="text-muted-foreground hover:text-primary opacity-0 group-hover/msg:opacity-100 transition-opacity" title="Listen">
                          <Volume2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                  {msg.role === "nexi" ? (
                    <div className="prose max-w-none text-foreground [&>p]:mb-3 [&>p]:text-[15px] [&>p]:leading-[1.75] [&>ul]:text-[15px] [&>ul]:leading-[1.75] [&>ol]:text-[15px] [&>ol]:leading-[1.75] [&>h1]:text-lg [&>h2]:text-base [&>h3]:text-[15px] [&>h3]:font-semibold">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.content}
                </div>
                <p className={cn("mt-1.5 text-xs text-muted-foreground/60", msg.role === "user" ? "text-right" : "")}>{msg.timestamp}</p>
              </motion.div>
            );
          })}

          {/* Typing indicator — before tokens arrive */}
          {isStreaming && !streamingContent && (
            <div className="max-w-[70%]">
              <div className="rounded-2xl bg-card border border-border/50 px-5 py-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-3">
                  <NexiAvatar />
                  <span className="text-sm font-semibold text-primary">Nexi</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {/* Streaming content */}
          {isStreaming && streamingContent && (
            <div className="max-w-[70%]">
              <div className="rounded-2xl bg-card border border-border/50 px-6 py-5 text-foreground shadow-sm font-display">
                <div className="flex items-center gap-2.5 mb-3.5">
                  <NexiAvatar />
                  <span className="text-sm font-semibold text-primary">Nexi</span>
                </div>
                <div className="prose max-w-none text-foreground [&>p]:mb-3 [&>p]:text-[15px] [&>p]:leading-[1.75]">
                  <ReactMarkdown>{streamingContent}</ReactMarkdown>
                </div>
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary rounded-full" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {sessionComplete && assessment ? (
          <div className="border-t border-border/60 bg-card px-6 py-5">
            <div className="rounded-2xl border border-success/20 bg-gradient-to-br from-success/8 to-success/3 p-6">
              <div className="flex items-center gap-3.5 mb-4">
                <div className="h-11 w-11 rounded-full bg-success/15 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <span className="text-base font-semibold text-foreground block">Session Complete!</span>
                  <span className="text-sm text-muted-foreground">Great work on this session</span>
                </div>
              </div>
              {"session_summary" in assessment && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{String(assessment.session_summary)}</p>
              )}
              {"strengths_observed" in assessment && Array.isArray(assessment.strengths_observed) && (
                <div className="mb-2">
                  <span className="text-sm font-medium text-success">Strengths: </span>
                  <span className="text-sm text-muted-foreground">{(assessment.strengths_observed as string[]).join(", ")}</span>
                </div>
              )}
              {"areas_for_improvement" in assessment && Array.isArray(assessment.areas_for_improvement) && (
                <div>
                  <span className="text-sm font-medium text-warning">To improve: </span>
                  <span className="text-sm text-muted-foreground">{(assessment.areas_for_improvement as string[]).join(", ")}</span>
                </div>
              )}
              <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">
                Back to Dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div className="border-t border-border/60 bg-card px-6 py-4">
            {/* Voice mode overlay */}
            <AnimatePresence>
              {voiceMode && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Audio visualizer */}
                      <div className="relative flex items-center justify-center h-10 w-10">
                        <div className={cn(
                          "absolute inset-0 rounded-full transition-all duration-150",
                          isRecording ? "bg-destructive/20 animate-pulse" : ttsPlaying ? "bg-primary/20 animate-pulse" : "bg-muted/30"
                        )} style={isRecording ? { transform: `scale(${1 + audioLevel * 0.5})` } : {}} />
                        <div className="relative z-10">
                          {isRecording ? (
                            <AudioLines className="h-5 w-5 text-destructive" />
                          ) : isTranscribing ? (
                            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          ) : ttsPlaying ? (
                            <Volume2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Mic className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {isRecording ? "Listening..." : isTranscribing ? "Thinking..." : ttsPlaying ? "Nexi is speaking..." : isStreaming ? "Nexi is thinking..." : "Ready — start speaking"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isRecording ? "Speak naturally — I'll know when you're done" : "Voice conversation mode"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={toggleVoiceMode}
                      className="rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors border border-border/60"
                    >
                      Exit Voice
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3">
              <div className="flex flex-1 items-center gap-2.5 rounded-2xl border border-border/60 bg-surface/50 px-5 py-3.5 focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={voiceMode ? "Voice mode active — or type here..." : "Reply to Nexi..."} disabled={isStreaming}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50" />

                {/* Voice mode toggle */}
                <button
                  onClick={voiceMode ? handleMic : toggleVoiceMode}
                  disabled={isTranscribing}
                  title={voiceMode ? (isRecording ? "Stop recording" : "Start recording") : "Enter voice mode"}
                  className={cn(
                    "rounded-xl p-2.5 transition-all",
                    voiceMode && isRecording
                      ? "bg-destructive/10 text-destructive"
                      : voiceMode
                      ? "bg-primary/10 text-primary"
                      : isTranscribing
                      ? "bg-primary/10 text-primary animate-pulse"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                >
                  {isTranscribing ? (
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : voiceMode ? (
                    isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>

                <button className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"><Lightbulb className="h-4 w-4" /></button>
                <button onClick={handleSend} disabled={!inputMessage.trim() || isStreaming} className="rounded-xl bg-primary p-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm">
                  <Send className="h-4 w-4" />
                </button>
              </div>
              {activeStage === "reflect" && (
                <button onClick={handleFinishSession} disabled={completing}
                  className="shrink-0 rounded-xl bg-success px-5 py-3 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-50 transition-colors shadow-sm">
                  {completing ? "Finishing..." : "Finish Session"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Panel — Studio Panel (category-aware) or Thinking Scaffold */}
      {(() => {
        const StudioPanel = getStudioPanel(courseCategory);
        if (StudioPanel) {
          // Course-specific studio panel — always visible for non-general courses
          return (
            <>
              {!scaffoldOpen && (
                <button
                  onClick={() => setScaffoldOpen(true)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 rounded-l-2xl border border-r-0 border-border/60 bg-card px-2.5 py-6 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-md"
                  title="Open Studio"
                >
                  <Layout className="h-4 w-4" />
                </button>
              )}
              <AnimatePresence>
              {scaffoldOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 380, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0 overflow-hidden border-l border-border/60 bg-surface/50"
              >
                <div className="w-[380px] h-full flex flex-col">
                  <div className="flex items-center justify-end px-3 py-2 border-b border-border/60">
                    <button onClick={() => setScaffoldOpen(false)} className="text-muted-foreground hover:text-foreground rounded-lg p-1 hover:bg-muted/50 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <StudioPanel className="flex-1 overflow-hidden" />
                </div>
              </motion.div>
              )}
              </AnimatePresence>
            </>
          );
        }

        // Default: Thinking Scaffold for general courses
        return (
          <>
            {!scaffoldOpen && (
              <button
                onClick={() => setScaffoldOpen(true)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 rounded-l-2xl border border-r-0 border-border/60 bg-card px-2.5 py-6 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-md"
                title="Open Thinking Scaffold"
              >
                <Lightbulb className="h-4 w-4" />
              </button>
            )}
            <AnimatePresence>
            {scaffoldOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 overflow-hidden border-l border-border/60 bg-surface/50"
            >
            <div className="w-[320px] overflow-y-auto h-full scrollbar-none">
              <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Thinking Scaffold</h3>
                <button onClick={() => setScaffoldOpen(false)} className="text-muted-foreground hover:text-foreground rounded-lg p-1 hover:bg-muted/50 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={activeStage + "-insight"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="px-5 pt-4 pb-2">
                  <InsightBanner variant="warning">{scaffoldObservation}</InsightBanner>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.div key={activeStage + "-prompts"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ delay: 0.05 }} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-primary">Consider</p>
                  </div>
                  <ul className="space-y-2.5">
                    {scaffoldPrompts.map((prompt, i) => (
                      <li key={i} className="text-sm text-muted-foreground leading-relaxed pl-3.5 border-l-2 border-primary/20">{prompt}</li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>

              <div className="mx-5 border-t border-border/50" />

              {/* Tabs */}
              <div className="px-5 pt-4">
                <div className="flex rounded-xl bg-muted/60 p-1">
                  {(["assumptions", "evidence", "alternatives", "notes"] as const).map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={cn("flex-1 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
                      {tab === "evidence" ? "Show Work" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-5 py-4">
                <textarea
                  value={notes[activeTab] || ""}
                  onChange={(e) => handleNoteChange(activeTab, e.target.value)}
                  placeholder={`Jot down your ${activeTab}...`}
                  className="w-full min-h-[120px] resize-none rounded-xl border border-border/60 bg-card p-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/10 focus:border-primary/30 transition-all"
                />
                <AnimatePresence mode="wait">
                  {saveStatus !== "idle" && (
                    <motion.p key={saveStatus} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-1.5 text-sm text-muted-foreground flex items-center gap-1">
                      {saveStatus === "saving" && "Saving..."}
                      {saveStatus === "saved" && <><Check className="h-3.5 w-3.5 text-primary" /> Saved</>}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
            </motion.div>
            )}
            </AnimatePresence>
          </>
        );
      })()}
    </div>
  );
}
