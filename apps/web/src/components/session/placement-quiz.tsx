"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Check, Sparkles, ArrowRight, Loader2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface QuizQuestion {
  id: number;
  type: "multiple_choice" | "true_false" | "scenario";
  difficulty: number;
  question: string;
  context: string | null;
  options: Array<{ id: string; text: string }>;
  correct_answer: string | null;
  explanation: string;
}

interface QuizResult {
  score: number;
  total: number;
  percentage: number;
  teach_depth: "foundational" | "intermediate" | "advanced";
  familiarity: string;
  skip_to_mode: string;
  results: Array<{
    id: number;
    correct: boolean | null;
    user_answer: string | null;
    correct_answer: string | null;
    explanation: string;
  }>;
}

interface PlacementQuizProps {
  quizTitle: string;
  questions: QuizQuestion[];
  courseTitle: string;
  onComplete: (answers: Record<string, string>) => void;
  onSkip: () => void;
  isSubmitting: boolean;
  result?: QuizResult | null;
}

// ─── Nexi Verdict Messages ──────────────────────────────────────────────────

function getNexiVerdict(result: QuizResult, courseTitle: string): { emoji: string; title: string; message: string } {
  const pct = result.percentage;
  const depth = result.teach_depth;

  if (depth === "advanced") {
    return {
      emoji: "🔥",
      title: "You really know your stuff!",
      message: `You scored ${pct}% — impressive. You clearly have strong experience with ${courseTitle}. I'll skip the basics and jump straight into advanced concepts, edge cases, and challenging scenarios. Let's push your understanding even further.`,
    };
  }

  if (depth === "intermediate") {
    return {
      emoji: "💡",
      title: "Solid foundation — let's build on it",
      message: `You scored ${pct}% — you've got a good grasp of the fundamentals of ${courseTitle}. I'll skip the intro stuff and focus on the nuances, patterns, and deeper concepts that'll take you to the next level.`,
    };
  }

  if (pct >= 25) {
    return {
      emoji: "🌱",
      title: "Great starting point!",
      message: `You scored ${pct}% — and that's perfectly fine! Everyone starts somewhere. I'll walk you through ${courseTitle} step by step, starting with the foundations. No assumptions, no jargon. We'll build your understanding from the ground up.`,
    };
  }

  return {
    emoji: "👋",
    title: "Welcome — let's start fresh!",
    message: `This looks like new territory for you, and that's exciting! I'll guide you through ${courseTitle} from scratch, nice and easy. Think of me as your patient tutor — ask anything, anytime. No question is too basic.`,
  };
}

// ─── Difficulty Badge ────────────────────────────────────────────────────────

function DifficultyBadge({ level }: { level: number }) {
  const config = {
    1: { label: "Basic", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    2: { label: "Intermediate", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    3: { label: "Advanced", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  }[level] || { label: "Basic", color: "bg-muted text-muted-foreground border-border" };

  return (
    <span className={cn("text-xs font-medium px-2.5 py-0.5 rounded-full border", config.color)}>
      {config.label}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PlacementQuiz({ quizTitle, questions, courseTitle, onComplete, onSkip, isSubmitting, result: externalResult }: PlacementQuizProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const currentQ = questions[currentIndex];
  const totalAnswered = Object.keys(answers).length;
  const allAnswered = totalAnswered === questions.length;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const selectAnswer = useCallback((optionId: string) => {
    setAnswers((prev) => ({ ...prev, [String(currentQ.id)]: optionId }));
  }, [currentQ]);

  const goNext = useCallback(() => {
    if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
  }, [currentIndex, questions.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const handleSubmit = useCallback(async () => {
    // Pass raw answers to parent — parent will submit to API and set result
    onComplete(answers);
  }, [answers, onComplete]);

  // ─── Results Screen ──────────────────────────────────────────────────────

  if (externalResult) {
    const verdict = getNexiVerdict(externalResult, courseTitle);

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[70vh] px-8 max-w-2xl mx-auto"
      >
        {/* Nexi Avatar */}
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-violet-400 flex items-center justify-center shadow-lg shadow-primary/20 mb-6">
          <span className="text-2xl font-bold text-white">N</span>
        </div>

        {/* Verdict */}
        <div className="text-center mb-8">
          <span className="text-4xl mb-3 block">{verdict.emoji}</span>
          <h2 className="text-2xl font-bold text-foreground mb-2">{verdict.title}</h2>
          <p className="text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
            {verdict.message}
          </p>
        </div>

        {/* Score card */}
        <div className="w-full rounded-2xl border border-border/60 bg-card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">Your Score</span>
            <span className="text-2xl font-bold text-primary">{externalResult.percentage}%</span>
          </div>
          <div className="h-3 rounded-full bg-muted/70 overflow-hidden mb-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${externalResult.percentage}%` }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
              className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
            />
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{externalResult.score}</span>/{externalResult.total} correct
            </span>
            <span className="text-muted-foreground">
              Level: <span className="font-semibold text-foreground capitalize">{externalResult.teach_depth}</span>
            </span>
          </div>
        </div>

        {/* Question breakdown */}
        <div className="w-full rounded-2xl border border-border/60 bg-card p-6 mb-8">
          <h3 className="text-sm font-semibold text-foreground mb-4">Question Breakdown</h3>
          <div className="space-y-3">
            {externalResult.results.map((r, i) => {
              const q = questions.find((q) => q.id === r.id);
              return (
                <div key={r.id} className="flex items-start gap-3">
                  <div className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs font-medium mt-0.5",
                    r.correct === true ? "bg-emerald-500/10 text-emerald-600" :
                    r.correct === false ? "bg-red-500/10 text-red-600" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {r.correct === true ? "✓" : r.correct === false ? "✗" : "–"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug line-clamp-1">{q?.question}</p>
                    {r.correct === false && r.explanation && (
                      <p className="text-xs text-muted-foreground mt-1">{r.explanation}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Start Session Button */}
        <button
          onClick={() => onSkip()}
          className="flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <Sparkles className="h-5 w-5" />
          Start Learning
          <ArrowRight className="h-5 w-5" />
        </button>
      </motion.div>
    );
  }

  // ─── Quiz Screen ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-[70vh] max-w-2xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{quizTitle}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Quick assessment to personalize your learning experience
            </p>
          </div>
          <button
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip quiz
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted/70 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            {currentIndex + 1}/{questions.length}
          </span>
        </div>
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="flex-1"
        >
          <div className="flex items-center gap-2 mb-4">
            <DifficultyBadge level={currentQ.difficulty} />
            <span className="text-xs text-muted-foreground capitalize">{currentQ.type.replace("_", " ")}</span>
          </div>

          {/* Scenario context */}
          {currentQ.context && (
            <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 mb-5">
              <p className="text-sm text-foreground leading-relaxed">{currentQ.context}</p>
            </div>
          )}

          <h2 className="text-lg font-semibold text-foreground leading-relaxed mb-6">
            {currentQ.question}
          </h2>

          {/* Options */}
          <div className="space-y-3">
            {currentQ.options.map((opt) => {
              const isSelected = answers[String(currentQ.id)] === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => selectAnswer(opt.id)}
                  className={cn(
                    "w-full text-left rounded-2xl border p-4 transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border/60 bg-card hover:border-primary/30 hover:bg-primary/[0.02]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold border-2 transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30 text-muted-foreground"
                    )}>
                      {isSelected ? <Check className="h-3.5 w-3.5" /> : opt.id.toUpperCase()}
                    </div>
                    <span className={cn(
                      "text-sm leading-relaxed pt-0.5",
                      isSelected ? "text-foreground font-medium" : "text-foreground"
                    )}>
                      {opt.text}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/40">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        <div className="flex items-center gap-2">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-all",
                i === currentIndex ? "bg-primary scale-125" :
                answers[String(questions[i].id)] ? "bg-primary/40" : "bg-muted-foreground/20"
              )}
            />
          ))}
        </div>

        {currentIndex < questions.length - 1 ? (
          <button
            onClick={goNext}
            className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || isSubmitting}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                See My Level
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Re-export the result setter for parent use
export type { QuizResult, QuizQuestion };
