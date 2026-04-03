"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, MicOff, Lightbulb, Layout, HelpCircle, Check, ChevronDown, X, Volume2, VolumeX, CheckCircle2, BookOpen, AudioLines, Copy, BookMarked } from "lucide-react";
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
import { FollowUpChips } from "@/components/workspace/FollowUpChips";
import { SourcesPane } from "@/components/workspace/SourcesPane";
import { NotebookPane } from "@/components/workspace/NotebookPane";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import { apiClient as notebookClient } from "@/lib/api-client";

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
  if (typeof window === "undefined") return false;
  try {
    const val = localStorage.getItem("arena-auto-read");
    return val === "true"; // default false if null
  } catch { return false; }
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
  // Guard: don't auto-read messages that were loaded as part of session resume
  const sessionReadyRef = useRef(false);
  const readMessagesRef = useRef<Set<string>>(new Set());

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
        setTimeout(() => { if (voiceModeRef.current) voiceStartRecordingRef.current(); }, 300);
      }
    } catch (err) {
      console.error("[STT] Transcription failed:", err);
      // Re-listen if in voice mode so the loop doesn't die on STT errors
      if (voiceModeRef.current) {
        setTimeout(() => { if (voiceModeRef.current) voiceStartRecordingRef.current(); }, 500);
      }
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

  // Wait for session to load existing messages before allowing auto-read
  useEffect(() => {
    const timer = setTimeout(() => { sessionReadyRef.current = true; }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-read new Nexi messages when voice/auto-read is on (skip resumed messages)
  useEffect(() => {
    if (!autoRead || !sessionReadyRef.current) return;
    const lastMsg = liveMessages[liveMessages.length - 1];
    if (!lastMsg || lastMsg.role !== "nexi") return;
    if (readMessagesRef.current.has(lastMsg.id)) return;
    readMessagesRef.current.add(lastMsg.id);
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
      // Stop any playing audio first to prevent mic picking up TTS
      stopTTS();
      setVoiceMode(true);
      setAutoRead(true);
      try { localStorage.setItem("arena-auto-read", "true"); } catch {}
      // Mark session ready so auto-read works from this point
      sessionReadyRef.current = true;
      // Wait for audio to fully stop before opening mic
      setTimeout(() => voiceStartRecording(), 500);
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
    : 0; // Show 0% until course outline loads — don't guess from phase index
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
    <div className="h-[calc(100vh-3.5rem)]">
      <WorkspaceLayout
        sourcesContent={(sourcesMode, setSourcesMode) => (
          <SourcesPane
            mode={sourcesMode}
            setMode={setSourcesMode}
            courseId={courseIdRef.current}
            courseOutline={courseOutline}
            currentTopicId={currentTopicId}
            topicsCovered={topicsCovered}
          />
        )}
        notebookContent={(notebookMode, setNotebookMode) => (
          <NotebookPane
            mode={notebookMode}
            setMode={setNotebookMode}
            courseId={courseIdRef.current}
          />
        )}
        nexiContent={
      <div className="flex flex-col h-full">

      {/* Center Panel — Chat */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center gap-2.5 border-b border-border/60 bg-card px-5 py-3.5 overflow-x-auto scrollbar-none">
          {courseOutline.length > 0 ? (
            /* Show course topics when outline is available */
            courseOutline.map((section) => {
              const isCurrent = section.id === currentTopicId;
              const isCovered = topicsCovered.includes(section.id);
              return (
                <span key={section.id} className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-all whitespace-nowrap shrink-0",
                  isCurrent ? "text-white shadow-sm bg-primary" :
                  isCovered ? "bg-primary/15 text-primary" :
                  "bg-muted/70 text-muted-foreground"
                )}>
                  {isCovered && !isCurrent ? "✓ " : ""}{section.title}
                </span>
              );
            })
          ) : (
            /* Fallback to teaching phase labels when no outline */
            stages.map((stage) => {
              const isActive = stage.key === activeStage;
              return (
                <span key={stage.key} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium transition-all whitespace-nowrap shrink-0", isActive ? "text-white shadow-sm" : "bg-muted/70 text-muted-foreground")}
                  style={isActive ? { backgroundColor: stageColors[stage.key] } : undefined}>
                  {stage.label}
                </span>
              );
            })
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

        <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-none scroll-smooth bg-background flex flex-col">
          <div className="flex-1" /> {/* Spacer pushes messages to bottom when content is short */}
          <div className="space-y-5">
          {allMessages.map((msg) => {
            // Check if this is a visual message
            let visualData: Record<string, unknown> | null = null;
            try {
              const parsed = JSON.parse(msg.content);
              if (parsed._visual) visualData = parsed;
            } catch { /* not JSON — regular message */ }

            if (visualData) {
              const vType = visualData.type as string;
              let visualComponent: React.ReactNode = null;
              if (vType === "mermaid" && visualData.content) {
                visualComponent = <MermaidDiagram content={visualData.content as string} title={visualData.title as string} caption={visualData.caption as string} />;
              } else if (vType === "chart" && visualData.data) {
                visualComponent = <DataChart chart_type={(visualData.chart_type as "bar" | "pie" | "line") || "bar"} data={visualData.data as Array<{ name: string; value: number }>} title={visualData.title as string} caption={visualData.caption as string} />;
              } else if (vType === "table" && visualData.headers && visualData.rows) {
                visualComponent = <ComparisonTable headers={visualData.headers as string[]} rows={visualData.rows as string[][]} title={visualData.title as string} caption={visualData.caption as string} />;
              } else if (vType === "mermaid") {
                // Mermaid without content — show the title/caption at least
                visualComponent = <MermaidDiagram content={String(visualData.content || "graph TD\n  A[No diagram data]")} title={visualData.title as string} caption={visualData.caption as string} />;
              }
              // Skip rendering if no visual component could be created
              if (!visualComponent) return null;
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-[80%]">
                  {visualComponent}
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
                    <>
                      <div className="prose max-w-none text-foreground [&>p]:mb-3 [&>p]:text-[15px] [&>p]:leading-[1.75] [&>ul]:text-[15px] [&>ul]:leading-[1.75] [&>ol]:text-[15px] [&>ol]:leading-[1.75] [&>h1]:text-lg [&>h2]:text-base [&>h3]:text-[15px] [&>h3]:font-semibold">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {/* Action buttons: Copy + Save to Notebook */}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/30 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                        <button
                          onClick={() => { navigator.clipboard.writeText(msg.content); }}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors"
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await notebookClient.createNote({
                                title: msg.content.slice(0, 50).replace(/\n/g, " "),
                                content: msg.content,
                                course_id: conversationIdRef.current ? undefined : undefined,
                                tags: ["nexi"],
                                source: "nexi",
                              });
                            } catch { /* silent */ }
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors"
                        >
                          <BookMarked className="h-3 w-3" /> Save to Notebook
                        </button>
                      </div>
                    </>
                  ) : msg.content}
                </div>
                {/* Follow-up chips after the last Nexi message */}
                {msg.role === "nexi" && msg === allMessages[allMessages.length - 1] && !isStreaming && (
                  <FollowUpChips onSelect={(text) => sendMessage(text)} disabled={isStreaming} />
                )}
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
          </div> {/* end space-y-5 messages container */}
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
      </div>
        }
      />
    </div>
  );
}
