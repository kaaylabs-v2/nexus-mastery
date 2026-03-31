"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Sparkles, CheckCircle2, Loader2, ArrowRight, BookOpen,
  X, Plus, Brain, Database, Search, LayoutList, Circle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { adminApi, type CourseFile, type IngestionJob } from "@/lib/api-client";

type Stage = "idle" | "processing" | "complete" | "created" | "error";

interface OutlineSection {
  id: number;
  title: string;
  description: string;
  key_concepts: string[];
  estimated_exchanges: number;
}

function SourceChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm group">
      <FileText className="h-4 w-4 text-primary/60 shrink-0" />
      <span className="text-foreground truncate">{name}</span>
      <button onClick={onRemove} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Pipeline stages mapped to backend status values
const PIPELINE_STAGES = [
  { key: "extracting", label: "Reading documents", icon: FileText },
  { key: "analyzing", label: "Analyzing with AI", icon: Brain },
  { key: "structuring", label: "Building course structure", icon: LayoutList },
  { key: "embedding", label: "Indexing for AI tutor", icon: Database },
  { key: "generating_outline", label: "Generating teaching modules", icon: Search },
] as const;

function LiveProgressFeed({ job }: { job: IngestionJob | null }) {
  const currentStatus = job?.status || "queued";
  const metadata = job?.ai_generated_metadata as Record<string, unknown> | null;
  const outline = metadata?.course_outline as OutlineSection[] | undefined;
  const courseTitle = metadata?.title as string | undefined;
  const [revealedModules, setRevealedModules] = useState(0);

  // Animate modules appearing one by one
  useEffect(() => {
    if (!outline || outline.length === 0) return;
    if (revealedModules >= outline.length) return;

    const timer = setTimeout(() => {
      setRevealedModules((prev) => prev + 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [outline, revealedModules]);

  // Reset revealed count when outline first appears
  const prevOutlineLen = useRef(0);
  useEffect(() => {
    const len = outline?.length || 0;
    if (len > 0 && prevOutlineLen.current === 0) {
      setRevealedModules(0); // Will trigger the animation chain
    }
    prevOutlineLen.current = len;
  }, [outline?.length]);

  const getStageState = (stageKey: string) => {
    const stageOrder: string[] = PIPELINE_STAGES.map((s) => s.key);
    const currentIdx = stageOrder.indexOf(currentStatus);
    const thisIdx = stageOrder.indexOf(stageKey);

    if (currentStatus === "completed") return "done";
    if (thisIdx < currentIdx) return "done";
    if (thisIdx === currentIdx) return "active";
    return "pending";
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {currentStatus === "completed"
              ? `Category ready${courseTitle ? `: ${courseTitle}` : ""}`
              : "Building your mastery category..."}
          </span>
        </div>
        {job && (
          <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${job.progress_pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        )}
      </div>

      {/* Pipeline stages */}
      <div className="px-6 py-4 space-y-1">
        {PIPELINE_STAGES.map((stage) => {
          const state = getStageState(stage.key);
          const Icon = stage.icon;
          return (
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 py-1.5"
            >
              {state === "done" ? (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              ) : state === "active" ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              <Icon className={`h-3.5 w-3.5 shrink-0 ${state === "pending" ? "text-muted-foreground/40" : "text-muted-foreground"}`} />
              <span className={`text-sm ${state === "active" ? "text-foreground font-medium" : state === "done" ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                {stage.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Live module reveals */}
      {outline && outline.length > 0 && (
        <div className="border-t border-border">
          <div className="px-6 py-3 bg-primary/5">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">
              {revealedModules >= outline.length
                ? `${outline.length} Teaching Modules Generated`
                : `Generating modules...`}
            </p>
          </div>
          <div className="px-6 py-3 space-y-2 max-h-[300px] overflow-y-auto">
            <AnimatePresence>
              {outline.slice(0, revealedModules).map((section, i) => (
                <motion.div
                  key={section.id}
                  initial={{ opacity: 0, y: 12, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="flex items-start gap-3 py-2"
                >
                  <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{section.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{section.description}</p>
                    {section.key_concepts && section.key_concepts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {section.key_concepts.slice(0, 3).map((concept) => (
                          <span key={concept} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {concept}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  );
}

type InputMode = "upload" | "prompt";

export default function UploadPipelinePage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [promptText, setPromptText] = useState("");
  const [job, setJob] = useState<IngestionJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
  }, []);

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const startPolling = (genJob: IngestionJob) => {
    setJob(genJob);
    pollRef.current = setInterval(async () => {
      try {
        const updated = await adminApi.pollIngestion(genJob.id);
        setJob(updated);
        if (updated.status === "completed") {
          clearInterval(pollRef.current!);
          setTimeout(() => setStage("complete"), 1500);
        } else if (updated.status === "failed") {
          clearInterval(pollRef.current!);
          setError(updated.error_message || "Generation failed");
          setStage("error");
        }
      } catch { clearInterval(pollRef.current!); }
    }, 1500);
  };

  const handleGenerate = async () => {
    if (files.length === 0) return;
    try {
      setStage("processing");
      const uploaded = await adminApi.uploadFiles(files);
      const genJob = await adminApi.generateCourse(uploaded.files.map((f) => f.id));
      startPolling(genJob);
    } catch (e) {
      setError(String(e));
      setStage("error");
    }
  };

  const handleGenerateFromPrompt = async () => {
    if (promptText.trim().length < 10) return;
    try {
      setStage("processing");
      const genJob = await adminApi.generateFromPrompt(promptText.trim());
      startPolling(genJob);
    } catch (e) {
      setError(String(e));
      setStage("error");
    }
  };

  const reset = () => { setStage("idle"); setFiles([]); setPromptText(""); setJob(null); setError(null); };

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const metadata = job?.ai_generated_metadata as Record<string, unknown> | null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">

        <div className="text-center space-y-1.5">
          <h2 className="text-lg font-display font-semibold text-foreground">Add your sources</h2>
          <p className="text-sm text-muted-foreground">Upload materials and AI will create a complete mastery category from them.</p>
        </div>

        <AnimatePresence mode="wait">
          {/* IDLE */}
          {stage === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              {/* Mode toggle */}
              <div className="flex items-center justify-center">
                <div className="inline-flex rounded-xl bg-muted/60 p-1">
                  <button onClick={() => setInputMode("upload")}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${inputMode === "upload" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    Upload files
                  </button>
                  <button onClick={() => setInputMode("prompt")}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${inputMode === "prompt" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                    Describe with AI
                  </button>
                </div>
              </div>

              {inputMode === "upload" ? (
                <>
                  {files.length > 0 && (
                    <div className="space-y-2">
                      {files.map((f, i) => (
                        <motion.div key={`${f.name}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                          <SourceChip name={f.name} onRemove={() => removeFile(i)} />
                        </motion.div>
                      ))}
                    </div>
                  )}

                  <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
                    onClick={() => document.getElementById("file-input")?.click()}
                    className="rounded-xl border-2 border-dashed border-border bg-card/50 hover:border-primary/40 hover:bg-card transition-all p-8 text-center cursor-pointer">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {files.length === 0 ? "Drop files here or click to upload" : "Add another source"}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">PDF, DOCX, PPTX, TXT, MD, CSV</p>
                    <input id="file-input" type="file" multiple accept=".pdf,.docx,.txt,.md,.pptx,.csv" onChange={handleFileInput} className="hidden" />
                  </div>

                  {files.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center pt-2">
                      <button onClick={handleGenerate}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                        <Sparkles className="h-4 w-4" /> Generate Category <ArrowRight className="h-4 w-4" />
                      </button>
                    </motion.div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-card/50 p-1">
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      placeholder="Describe the course you want to create...&#10;&#10;For example: &quot;A 4-week course on Python programming for data science beginners, covering pandas, numpy, matplotlib, and basic machine learning with scikit-learn&quot;"
                      className="w-full min-h-[140px] resize-none rounded-lg bg-transparent p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground/60 text-center">
                    AI will generate a full course with teaching modules, scenarios, and mastery criteria
                  </p>

                  {promptText.trim().length >= 10 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center">
                      <button onClick={handleGenerateFromPrompt}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                        <Sparkles className="h-4 w-4" /> Generate with AI <ArrowRight className="h-4 w-4" />
                      </button>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* PROCESSING — Live progress feed */}
          {stage === "processing" && <LiveProgressFeed key="processing" job={job} />}

          {/* COMPLETE — editable preview */}
          {stage === "complete" && metadata && (
            <motion.div key="complete" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              <div className="rounded-xl border border-primary/20 bg-card p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    Generated from {files.length} source{files.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">Title</label>
                    <input className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                      defaultValue={String(metadata.title || "")} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">Description</label>
                    <textarea className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground min-h-[72px] resize-y"
                      defaultValue={String(metadata.description || "")} />
                  </div>
                </div>

                {Array.isArray(metadata.domains) && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Skill Dimensions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(metadata.domains as Array<{ name: string }>).map((d) => (
                        <span key={d.name} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{d.name}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Teaching modules preview */}
                {Array.isArray(metadata.course_outline) && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Teaching Modules ({(metadata.course_outline as OutlineSection[]).length})</p>
                    <div className="space-y-1.5">
                      {(metadata.course_outline as OutlineSection[]).map((section, i) => (
                        <div key={section.id} className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2">
                          <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                            {i + 1}
                          </span>
                          <span className="text-sm text-foreground">{section.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(metadata.scenarios) && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Scenarios</p>
                    <div className="space-y-2">
                      {(metadata.scenarios as Array<{ title: string; description: string }>).map((s, i) => (
                        <div key={i} className="rounded-lg bg-muted/40 px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{s.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button onClick={reset} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors">Start Over</button>
                <button onClick={() => setStage("created")}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  <BookOpen className="h-4 w-4" /> Create Category
                </button>
              </div>
            </motion.div>
          )}

          {/* CREATED */}
          {stage === "created" && (
            <motion.div key="created" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-primary/20 bg-primary/5 p-8 text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Category Created!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  &quot;{String(metadata?.title || "New Category")}&quot; is ready.
                </p>
              </div>
              <div className="flex items-center gap-3 justify-center">
                <button onClick={reset} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors">Upload More</button>
                <button onClick={() => router.push("/categories")}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  Open Categories
                </button>
              </div>
            </motion.div>
          )}

          {/* ERROR */}
          {stage === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
              <p className="text-sm font-medium text-destructive">Generation Failed</p>
              <p className="text-xs text-destructive/80">{error}</p>
              <button onClick={reset} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">Try Again</button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
