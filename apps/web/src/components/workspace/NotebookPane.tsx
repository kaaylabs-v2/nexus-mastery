"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookMarked, ChevronLeft, Plus, Trash2, Sparkles, Loader2,
  StickyNote, BookOpen, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";

type NotebookMode = "mini" | "expanded";

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  created_at: string;
}

interface VocabEntry {
  id: string;
  term: string;
  definition: string;
  example?: string;
  tags: string[];
  created_at: string;
}

interface NotebookPaneProps {
  mode: NotebookMode;
  setMode: (m: NotebookMode) => void;
  courseId: string | null;
}

export function NotebookPane({ mode, setMode, courseId }: NotebookPaneProps) {
  const [tab, setTab] = useState<"notes" | "vocab">("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [quickNote, setQuickNote] = useState("");
  const [newTerm, setNewTerm] = useState("");
  const [newDef, setNewDef] = useState("");
  const [generating, setGenerating] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      const data = await apiClient.listNotes(courseId || undefined);
      setNotes(data);
    } catch { /* silent — notebook may not have data yet */ }
  }, [courseId]);

  const fetchVocab = useCallback(async () => {
    try {
      const data = await apiClient.listVocab(courseId || undefined);
      setVocab(data);
    } catch { /* silent */ }
  }, [courseId]);

  useEffect(() => {
    if (mode === "expanded") {
      fetchNotes();
      fetchVocab();
    }
  }, [mode, fetchNotes, fetchVocab]);

  const handleQuickCapture = async () => {
    if (!quickNote.trim()) return;
    try {
      await apiClient.createNote({
        title: quickNote.slice(0, 50),
        content: quickNote,
        course_id: courseId || undefined,
        tags: [],
        source: "personal",
      });
      setQuickNote("");
      fetchNotes();
    } catch { /* silent */ }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await apiClient.deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch { /* silent */ }
  };

  const handleAddVocab = async () => {
    if (!newTerm.trim() || !newDef.trim()) return;
    try {
      await apiClient.createVocab({
        term: newTerm,
        definition: newDef,
        course_id: courseId || undefined,
        tags: [],
      });
      setNewTerm("");
      setNewDef("");
      fetchVocab();
    } catch { /* silent */ }
  };

  const handleGenerateDefinition = async () => {
    if (!newTerm.trim()) return;
    setGenerating(true);
    try {
      const result = await apiClient.generateDefinition(newTerm, courseId || undefined);
      setNewDef(result.definition || "");
    } catch { /* silent */ }
    setGenerating(false);
  };

  const handleDeleteVocab = async (vocabId: string) => {
    try {
      await apiClient.deleteVocab(vocabId);
      setVocab((prev) => prev.filter((v) => v.id !== vocabId));
    } catch { /* silent */ }
  };

  // ── MINI MODE ──
  if (mode === "mini") {
    return (
      <div className="flex flex-col items-center py-4 gap-3 h-full">
        <button
          onClick={() => setMode("expanded")}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors relative"
          title="Open Notebook"
        >
          <BookMarked className="h-5 w-5" />
          {(notes.length + vocab.length) > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {notes.length + vocab.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  // ── EXPANDED MODE ──
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Notebook</span>
        </div>
        <button onClick={() => setMode("mini")} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/60">
        <button
          onClick={() => setTab("notes")}
          className={cn("flex-1 py-2.5 text-xs font-medium transition-colors", tab === "notes" ? "text-primary border-b-2 border-primary" : "text-muted-foreground")}
        >
          <StickyNote className="h-3.5 w-3.5 inline mr-1.5" />
          Notes ({notes.length})
        </button>
        <button
          onClick={() => setTab("vocab")}
          className={cn("flex-1 py-2.5 text-xs font-medium transition-colors", tab === "vocab" ? "text-primary border-b-2 border-primary" : "text-muted-foreground")}
        >
          <BookOpen className="h-3.5 w-3.5 inline mr-1.5" />
          Vocab ({vocab.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "notes" ? (
          <div className="p-3 space-y-3">
            {/* Quick capture */}
            <div className="flex gap-2">
              <input
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQuickCapture()}
                placeholder="Quick capture..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/10"
              />
              <button onClick={handleQuickCapture} disabled={!quickNote.trim()} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Notes list */}
            <AnimatePresence>
              {notes.map((note) => (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg border border-border/60 bg-card p-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground line-clamp-1">{note.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{note.content}</p>
                    </div>
                    <button onClick={() => handleDeleteNote(note.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {note.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {note.tags.map((tag) => (
                        <span key={tag} className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {notes.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">Save insights from Nexi or capture your own notes.</p>
            )}
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* Add vocab form */}
            <div className="space-y-2">
              <input
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="New term..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/30"
              />
              <div className="flex gap-2">
                <textarea
                  value={newDef}
                  onChange={(e) => setNewDef(e.target.value)}
                  placeholder="Definition..."
                  rows={2}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none resize-none focus:border-primary/30"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleGenerateDefinition} disabled={!newTerm.trim() || generating}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/5 disabled:opacity-50">
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Generate
                </button>
                <button onClick={handleAddVocab} disabled={!newTerm.trim() || !newDef.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                  <Plus className="h-3 w-3" /> Save
                </button>
              </div>
            </div>

            {/* Vocab list */}
            <AnimatePresence>
              {vocab.map((v) => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg border border-border/60 bg-card p-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{v.term}</p>
                      <p className="text-xs text-muted-foreground mt-1">{v.definition}</p>
                      {v.example && <p className="text-xs text-muted-foreground/70 mt-1 italic">&quot;{v.example}&quot;</p>}
                    </div>
                    <button onClick={() => handleDeleteVocab(v.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {vocab.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">Save key terms and definitions as you learn.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Export a helper to save a Nexi response as a note from outside
export async function saveNexiResponseAsNote(content: string, courseId?: string) {
  const title = content.slice(0, 50).replace(/\n/g, " ");
  await apiClient.createNote({
    title,
    content,
    course_id: courseId,
    tags: ["nexi"],
    source: "nexi",
  });
}
