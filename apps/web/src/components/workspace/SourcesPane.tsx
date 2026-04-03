"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, BookOpen, Video, Code, Link as LinkIcon,
  ChevronRight, ChevronDown, ChevronLeft, Presentation,
  FolderOpen, Check, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";

type SourcesMode = "mini" | "list" | "viewer";

interface OutlineSection {
  id: number;
  title: string;
  description?: string;
  key_concepts?: string[];
  visuals?: unknown[];
}

interface SourceFile {
  id: string;
  filename: string;
  file_type: string;
  uploaded_at: string;
}

interface MaterialChunk {
  id: string;
  content: string;
  source_file?: string;
  chunk_index: number;
}

interface TopicMaterial {
  topic_id: number;
  topic_title: string;
  chunks: MaterialChunk[];
}

interface SourcesPaneProps {
  mode: SourcesMode;
  setMode: (m: SourcesMode) => void;
  courseId: string | null;
  courseOutline: OutlineSection[];
  currentTopicId: number;
  topicsCovered: number[];
}

const TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileText,
  pptx: Presentation,
  video: Video,
  lecture: BookOpen,
  code: Code,
  link: LinkIcon,
  txt: FileText,
  md: FileText,
};

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return TYPE_ICONS[ext] || FileText;
}

export function SourcesPane({ mode, setMode, courseId, courseOutline, currentTopicId, topicsCovered }: SourcesPaneProps) {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [materials, setMaterials] = useState<TopicMaterial[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set([currentTopicId]));
  const [selectedChunk, setSelectedChunk] = useState<MaterialChunk | null>(null);

  useEffect(() => {
    if (!courseId) return;
    apiClient.getCourseMaterials(courseId).then((data) => {
      setFiles(data.files || []);
      setMaterials(data.materials || []);
    }).catch(() => {});
  }, [courseId]);

  const toggleTopic = (id: number) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── MINI MODE: Icon rail ──
  if (mode === "mini") {
    return (
      <div className="flex flex-col items-center py-4 gap-3 h-full">
        <button
          onClick={() => setMode("list")}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Open Sources"
        >
          <Layers className="h-5 w-5" />
        </button>
        <div className="w-6 border-t border-border/60" />
        {courseOutline.slice(0, 8).map((section) => {
          const isCovered = topicsCovered.includes(section.id);
          const isCurrent = section.id === currentTopicId;
          return (
            <button
              key={section.id}
              onClick={() => { setMode("list"); setExpandedTopics(new Set([section.id])); }}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors",
                isCurrent ? "bg-primary text-primary-foreground" :
                isCovered ? "bg-primary/15 text-primary" :
                "bg-muted text-muted-foreground"
              )}
              title={section.title}
            >
              {isCovered ? <Check className="h-3 w-3" /> : section.id}
            </button>
          );
        })}
      </div>
    );
  }

  // ── VIEWER MODE: Show selected chunk content ──
  if (mode === "viewer" && selectedChunk) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
          <button onClick={() => setMode("list")} className="p-1 rounded hover:bg-accent">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium text-foreground truncate">{selectedChunk.source_file || "Source"}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selectedChunk.content}</p>
        </div>
      </div>
    );
  }

  // ── LIST MODE: Materials grouped by topic ──
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Sources</span>
        </div>
        <button onClick={() => setMode("mini")} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Uploaded files */}
        {files.length > 0 && (
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2">Uploaded Files</p>
            <div className="space-y-1.5">
              {files.map((f) => {
                const Icon = getFileIcon(f.filename);
                return (
                  <div key={f.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{f.filename}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Course outline with materials */}
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-2 px-1">Course Modules</p>
          {courseOutline.map((section) => {
            const isCovered = topicsCovered.includes(section.id);
            const isCurrent = section.id === currentTopicId;
            const isExpanded = expandedTopics.has(section.id);
            const topicMaterial = materials.find((m) => m.topic_id === section.id);

            return (
              <div key={section.id} className="mb-1">
                <button
                  onClick={() => toggleTopic(section.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors",
                    isCurrent ? "bg-primary/5 text-foreground" : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                    isCovered ? "bg-primary text-primary-foreground" :
                    isCurrent ? "border-2 border-primary text-primary" :
                    "border border-muted-foreground/30 text-muted-foreground/50"
                  )}>
                    {isCovered ? <Check className="h-2.5 w-2.5" /> : section.id}
                  </div>
                  <span className={cn("text-xs flex-1 truncate", isCurrent && "font-semibold")}>{section.title}</span>
                  {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                </button>

                <AnimatePresence>
                  {isExpanded && topicMaterial && topicMaterial.chunks.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden pl-9"
                    >
                      {topicMaterial.chunks.slice(0, 5).map((chunk) => (
                        <button
                          key={chunk.id}
                          onClick={() => { setSelectedChunk(chunk); setMode("viewer"); }}
                          className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-accent/50 truncate block"
                        >
                          {chunk.content.slice(0, 60)}...
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {courseOutline.length === 0 && (
          <div className="px-4 py-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No course materials loaded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
