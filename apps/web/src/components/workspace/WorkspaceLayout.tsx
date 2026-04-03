"use client";

import { useState, useCallback } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

type SourcesMode = "mini" | "list" | "viewer";
type NotebookMode = "mini" | "expanded";

interface WorkspaceLayoutProps {
  sourcesContent: (mode: SourcesMode, setMode: (m: SourcesMode) => void) => React.ReactNode;
  nexiContent: React.ReactNode;
  notebookContent: (mode: NotebookMode, setMode: (m: NotebookMode) => void) => React.ReactNode;
}

const SOURCES_SIZES: Record<SourcesMode, number> = { mini: 3.5, list: 18, viewer: 32 };
const NOTEBOOK_SIZES: Record<NotebookMode, number> = { mini: 3.5, expanded: 20 };

export function WorkspaceLayout({ sourcesContent, nexiContent, notebookContent }: WorkspaceLayoutProps) {
  const [sourcesMode, setSourcesMode] = useState<SourcesMode>("mini");
  const [notebookMode, setNotebookMode] = useState<NotebookMode>("mini");

  const handleSourcesMode = useCallback((mode: SourcesMode) => {
    setSourcesMode(mode);
    if (mode === "viewer") setNotebookMode("mini");
  }, []);

  const handleNotebookMode = useCallback((mode: NotebookMode) => {
    setNotebookMode(mode);
    if (mode === "expanded" && sourcesMode === "viewer") setSourcesMode("list");
  }, [sourcesMode]);

  return (
    <Group orientation="horizontal" className="h-full">
      {/* Sources Pane */}
      <Panel defaultSize={SOURCES_SIZES[sourcesMode]} minSize={3} maxSize={40} className="bg-surface/50">
        {sourcesContent(sourcesMode, handleSourcesMode)}
      </Panel>

      {/* Handle: Sources ↔ Nexi */}
      {sourcesMode !== "mini" && (
        <Separator className="w-[3px] bg-border/40 hover:bg-primary/20 transition-colors" />
      )}

      {/* Nexi Chat Pane */}
      <Panel minSize={35} className="bg-background">
        {nexiContent}
      </Panel>

      {/* Handle: Nexi ↔ Notebook */}
      {notebookMode !== "mini" && (
        <Separator className="w-[3px] bg-border/40 hover:bg-primary/20 transition-colors" />
      )}

      {/* Notebook Pane */}
      <Panel defaultSize={NOTEBOOK_SIZES[notebookMode]} minSize={3} maxSize={30} className="bg-surface/50">
        {notebookContent(notebookMode, handleNotebookMode)}
      </Panel>
    </Group>
  );
}

export type { SourcesMode, NotebookMode };
