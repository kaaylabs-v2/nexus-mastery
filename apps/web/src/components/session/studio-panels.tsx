"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Play,
  Copy,
  Check,
  Terminal,
  FileCode,
  Briefcase,
  FlaskConical,
  Palette,
  RotateCcw,
  ChevronDown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CourseCategory = "coding" | "business" | "science" | "creative" | "general";

interface StudioPanelProps {
  className?: string;
}

// ─── Coding Studio ───────────────────────────────────────────────────────────
// Monaco-style code editor with syntax highlighting and output panel

const LANGUAGE_OPTIONS = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
];

export function CodingStudioPanel({ className }: StudioPanelProps) {
  const [code, setCode] = useState("# Write your code here\n\n");
  const [output, setOutput] = useState("");
  const [language, setLanguage] = useState("python");
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "output">("editor");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setActiveTab("output");
    setOutput("Running...\n");

    // For now, simulate execution — in production, this would hit a sandboxed
    // code execution API (e.g., Judge0, Piston, or a custom Lambda)
    setTimeout(() => {
      setOutput(
        `$ ${language} script.${language === "python" ? "py" : language === "javascript" ? "js" : language === "typescript" ? "ts" : language}\n\n` +
        "// Output will appear here when connected to a code runner.\n" +
        "// Paste your code and discuss it with Nexi!\n"
      );
      setIsRunning(false);
    }, 800);
  }, [code, language]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [code]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <FileCode className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <span className="text-sm font-medium text-foreground">Code Editor</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs rounded-lg border border-border/60 bg-surface/50 px-2.5 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary/20"
          >
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <button
            onClick={handleCopy}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            <Play className="h-3 w-3" />
            {isRunning ? "Running..." : "Run"}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border/60">
        <button
          onClick={() => setActiveTab("editor")}
          className={cn(
            "px-4 py-2 text-xs font-medium transition-colors border-b-2",
            activeTab === "editor"
              ? "border-emerald-500 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="flex items-center gap-1.5">
            <FileCode className="h-3 w-3" /> Editor
          </span>
        </button>
        <button
          onClick={() => setActiveTab("output")}
          className={cn(
            "px-4 py-2 text-xs font-medium transition-colors border-b-2",
            activeTab === "output"
              ? "border-emerald-500 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="flex items-center gap-1.5">
            <Terminal className="h-3 w-3" /> Output
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "editor" ? (
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-full resize-none bg-[#1e1e2e] text-[#cdd6f4] font-mono text-sm leading-relaxed p-4 outline-none scrollbar-none"
            placeholder="// Write or paste your code here..."
          />
        ) : (
          <div className="w-full h-full bg-[#1e1e2e] p-4 overflow-auto scrollbar-none">
            <pre className="text-sm font-mono text-[#a6adc8] whitespace-pre-wrap">
              {output || "No output yet. Click Run to execute your code."}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Business Studio ─────────────────────────────────────────────────────────
// Case study workspace with frameworks, SWOT, decision matrix

const FRAMEWORKS = [
  { id: "swot", label: "SWOT Analysis", fields: ["Strengths", "Weaknesses", "Opportunities", "Threats"] },
  { id: "pros_cons", label: "Pros & Cons", fields: ["Pros", "Cons"] },
  { id: "five_forces", label: "Porter's Five Forces", fields: ["Rivalry", "New Entrants", "Substitutes", "Buyer Power", "Supplier Power"] },
  { id: "notes", label: "Case Notes", fields: ["Key Facts", "Assumptions", "Questions", "Recommendations"] },
];

export function BusinessStudioPanel({ className }: StudioPanelProps) {
  const [activeFramework, setActiveFramework] = useState(FRAMEWORKS[0]);
  const [data, setData] = useState<Record<string, Record<string, string>>>({});

  const getFieldValue = (frameworkId: string, field: string) =>
    data[frameworkId]?.[field] || "";

  const setFieldValue = (frameworkId: string, field: string, value: string) =>
    setData((prev) => ({
      ...prev,
      [frameworkId]: { ...prev[frameworkId], [field]: value },
    }));

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Briefcase className="h-3.5 w-3.5 text-amber-500" />
        </div>
        <span className="text-sm font-medium text-foreground">Strategy Canvas</span>
      </div>

      {/* Framework selector */}
      <div className="flex gap-1.5 px-4 py-3 border-b border-border/60 overflow-x-auto scrollbar-none">
        {FRAMEWORKS.map((fw) => (
          <button
            key={fw.id}
            onClick={() => setActiveFramework(fw)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              activeFramework.id === fw.id
                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {fw.label}
          </button>
        ))}
      </div>

      {/* Framework fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none">
        {activeFramework.fields.length === 4 && activeFramework.id === "swot" ? (
          // 2x2 grid for SWOT
          <div className="grid grid-cols-2 gap-3 h-full">
            {activeFramework.fields.map((field, i) => (
              <div key={field} className={cn(
                "rounded-xl border p-3 flex flex-col",
                i === 0 ? "border-emerald-500/20 bg-emerald-500/5" :
                i === 1 ? "border-red-500/20 bg-red-500/5" :
                i === 2 ? "border-blue-500/20 bg-blue-500/5" :
                "border-orange-500/20 bg-orange-500/5"
              )}>
                <span className="text-xs font-semibold text-foreground mb-2">{field}</span>
                <textarea
                  value={getFieldValue(activeFramework.id, field)}
                  onChange={(e) => setFieldValue(activeFramework.id, field, e.target.value)}
                  placeholder={`List ${field.toLowerCase()}...`}
                  className="flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50 leading-relaxed"
                />
              </div>
            ))}
          </div>
        ) : (
          // Stacked fields for other frameworks
          activeFramework.fields.map((field) => (
            <div key={field} className="rounded-xl border border-border/60 p-3">
              <span className="text-xs font-semibold text-foreground block mb-2">{field}</span>
              <textarea
                value={getFieldValue(activeFramework.id, field)}
                onChange={(e) => setFieldValue(activeFramework.id, field, e.target.value)}
                placeholder={`Add your ${field.toLowerCase()}...`}
                rows={3}
                className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50 leading-relaxed"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Science Studio ──────────────────────────────────────────────────────────
// Equation scratchpad, hypothesis tracker, experiment log

export function ScienceStudioPanel({ className }: StudioPanelProps) {
  const [activeTab, setActiveTab] = useState<"equations" | "hypothesis" | "notes">("equations");
  const [equations, setEquations] = useState("");
  const [hypothesis, setHypothesis] = useState({ question: "", prediction: "", reasoning: "", result: "" });
  const [notes, setNotes] = useState("");

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
        </div>
        <span className="text-sm font-medium text-foreground">Science Lab</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/60">
        {(["equations", "hypothesis", "notes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-xs font-medium transition-colors border-b-2 capitalize",
              activeTab === tab
                ? "border-violet-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "equations" ? "Equations & Formulas" : tab === "hypothesis" ? "Hypothesis" : "Lab Notes"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
        {activeTab === "equations" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Write equations, formulas, or derivations. Use standard notation — Nexi can help verify them.</p>
            <textarea
              value={equations}
              onChange={(e) => setEquations(e.target.value)}
              placeholder={"E = mc²\nF = ma\nPV = nRT\n\nDerivation steps:\n1. Start with...\n2. Apply...\n3. Therefore..."}
              className="w-full min-h-[300px] resize-none rounded-xl border border-border/60 bg-surface/30 p-4 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-violet-500/20 focus:border-violet-500/30"
            />
          </div>
        )}

        {activeTab === "hypothesis" && (
          <div className="space-y-4">
            {(["question", "prediction", "reasoning", "result"] as const).map((field) => (
              <div key={field} className="rounded-xl border border-border/60 p-3">
                <span className="text-xs font-semibold text-foreground block mb-2 capitalize">
                  {field === "question" ? "Research Question" : field === "prediction" ? "Your Prediction" : field === "reasoning" ? "Reasoning / Evidence" : "Observed Result"}
                </span>
                <textarea
                  value={hypothesis[field]}
                  onChange={(e) => setHypothesis((prev) => ({ ...prev, [field]: e.target.value }))}
                  placeholder={
                    field === "question" ? "What are you trying to find out?" :
                    field === "prediction" ? "What do you think will happen?" :
                    field === "reasoning" ? "Why do you think that? What evidence supports this?" :
                    "What actually happened?"
                  }
                  rows={3}
                  className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 leading-relaxed"
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === "notes" && (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={"Observations:\n- \n\nData collected:\n- \n\nKey findings:\n- "}
            className="w-full min-h-[300px] resize-none rounded-xl border border-border/60 bg-surface/30 p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-violet-500/20 focus:border-violet-500/30 leading-relaxed"
          />
        )}
      </div>
    </div>
  );
}

// ─── Creative Studio ─────────────────────────────────────────────────────────
// Mood board, color palette, design critique notes

export function CreativeStudioPanel({ className }: StudioPanelProps) {
  const [activeTab, setActiveTab] = useState<"critique" | "moodboard" | "notes">("critique");
  const [critique, setCritique] = useState({ whats_working: "", whats_not: "", inspiration: "", next_iteration: "" });
  const [notes, setNotes] = useState("");

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="h-7 w-7 rounded-lg bg-pink-500/10 flex items-center justify-center">
          <Palette className="h-3.5 w-3.5 text-pink-500" />
        </div>
        <span className="text-sm font-medium text-foreground">Creative Studio</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/60">
        {(["critique", "moodboard", "notes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-xs font-medium transition-colors border-b-2 capitalize",
              activeTab === tab
                ? "border-pink-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "critique" ? "Design Critique" : tab === "moodboard" ? "Mood Board" : "Notes"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
        {activeTab === "critique" && (
          <div className="space-y-3">
            {(["whats_working", "whats_not", "inspiration", "next_iteration"] as const).map((field) => (
              <div key={field} className={cn(
                "rounded-xl border p-3",
                field === "whats_working" ? "border-emerald-500/20 bg-emerald-500/5" :
                field === "whats_not" ? "border-red-500/20 bg-red-500/5" :
                field === "inspiration" ? "border-blue-500/20 bg-blue-500/5" :
                "border-pink-500/20 bg-pink-500/5"
              )}>
                <span className="text-xs font-semibold text-foreground block mb-2">
                  {field === "whats_working" ? "What's Working" :
                   field === "whats_not" ? "What Needs Work" :
                   field === "inspiration" ? "Inspiration & References" :
                   "Next Iteration"}
                </span>
                <textarea
                  value={critique[field]}
                  onChange={(e) => setCritique((prev) => ({ ...prev, [field]: e.target.value }))}
                  placeholder={
                    field === "whats_working" ? "Elements that are successful..." :
                    field === "whats_not" ? "Areas that need improvement..." :
                    field === "inspiration" ? "References, styles, artists..." :
                    "Changes for the next version..."
                  }
                  rows={2}
                  className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 leading-relaxed"
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === "moodboard" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Collect colors, keywords, and visual ideas that inspire your work.</p>
            <div className="rounded-xl border border-border/60 p-4">
              <span className="text-xs font-semibold text-foreground block mb-3">Color Palette</span>
              <div className="flex gap-2 flex-wrap">
                {["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"].map((color) => (
                  <div key={color} className="flex flex-col items-center gap-1">
                    <div className="h-10 w-10 rounded-lg shadow-sm border border-border/40" style={{ backgroundColor: color }} />
                    <span className="text-[10px] text-muted-foreground font-mono">{color}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <span className="text-xs font-semibold text-foreground block mb-2">Keywords & Themes</span>
              <textarea
                placeholder="minimalist, organic, bold typography, warm tones..."
                rows={3}
                className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40 leading-relaxed"
              />
            </div>
          </div>
        )}

        {activeTab === "notes" && (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={"Design decisions:\n- \n\nFeedback received:\n- \n\nAction items:\n- "}
            className="w-full min-h-[300px] resize-none rounded-xl border border-border/60 bg-surface/30 p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-pink-500/20 focus:border-pink-500/30 leading-relaxed"
          />
        )}
      </div>
    </div>
  );
}

// ─── Panel Selector ──────────────────────────────────────────────────────────

export function getStudioPanel(category: CourseCategory): React.ComponentType<StudioPanelProps> | null {
  switch (category) {
    case "coding": return CodingStudioPanel;
    case "business": return BusinessStudioPanel;
    case "science": return ScienceStudioPanel;
    case "creative": return CreativeStudioPanel;
    case "general": return null; // Uses default thinking scaffold
    default: return null;
  }
}
