"use client";

import { useState, useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GripVertical } from "lucide-react";

type SourcesMode = "mini" | "list" | "viewer";
type NotebookMode = "mini" | "expanded";

interface WorkspaceLayoutProps {
  sourcesContent: (mode: SourcesMode, setMode: (m: SourcesMode) => void) => React.ReactNode;
  nexiContent: React.ReactNode;
  notebookContent: (mode: NotebookMode, setMode: (m: NotebookMode) => void) => React.ReactNode;
}

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const SOURCES_SIZES: Record<SourcesMode, number> = { mini: 3.5, list: 18, viewer: 32 };
const NOTEBOOK_SIZES: Record<NotebookMode, number> = { mini: 3.5, expanded: 20 };

export function WorkspaceLayout({ sourcesContent, nexiContent, notebookContent }: WorkspaceLayoutProps) {
  const [sourcesMode, setSourcesMode] = useState<SourcesMode>("mini");
  const [notebookMode, setNotebookMode] = useState<NotebookMode>("mini");

  const handleSourcesMode = useCallback((mode: SourcesMode) => {
    setSourcesMode(mode);
    // Auto-collapse notebook when sources enters viewer mode
    if (mode === "viewer") setNotebookMode("mini");
  }, []);

  const handleNotebookMode = useCallback((mode: NotebookMode) => {
    setNotebookMode(mode);
    // Auto-collapse sources from viewer when notebook expands
    if (mode === "expanded" && sourcesMode === "viewer") setSourcesMode("list");
  }, [sourcesMode]);

  const sourcesSize = SOURCES_SIZES[sourcesMode];
  const notebookSize = NOTEBOOK_SIZES[notebookMode];

  return (
    <PanelGroup direction="horizontal" className="h-full">
      {/* Sources Pane */}
      <Panel
        defaultSize={sourcesSize}
        minSize={3}
        maxSize={40}
        style={{ transition: `flex ${280}ms ${EASE}` }}
        className="bg-surface/50"
      >
        {sourcesContent(sourcesMode, handleSourcesMode)}
      </Panel>

      {/* Handle: Sources ↔ Nexi */}
      {sourcesMode !== "mini" && (
        <PanelResizeHandle className="w-[3px] bg-border/40 hover:bg-primary/20 transition-colors data-[resize-handle-active]:bg-primary/40">
          <div className="flex h-full items-center justify-center">
            <GripVertical className="h-3 w-3 text-muted-foreground/30" />
          </div>
        </PanelResizeHandle>
      )}

      {/* Nexi Chat Pane (center — always dominant) */}
      <Panel
        defaultSize={100 - sourcesSize - notebookSize}
        minSize={35}
        className="bg-background"
      >
        {nexiContent}
      </Panel>

      {/* Handle: Nexi ↔ Notebook */}
      {notebookMode !== "mini" && (
        <PanelResizeHandle className="w-[3px] bg-border/40 hover:bg-primary/20 transition-colors data-[resize-handle-active]:bg-primary/40">
          <div className="flex h-full items-center justify-center">
            <GripVertical className="h-3 w-3 text-muted-foreground/30" />
          </div>
        </PanelResizeHandle>
      )}

      {/* Notebook Pane */}
      <Panel
        defaultSize={notebookSize}
        minSize={3}
        maxSize={30}
        style={{ transition: `flex ${280}ms ${EASE}` }}
        className="bg-surface/50"
      >
        {notebookContent(notebookMode, handleNotebookMode)}
      </Panel>
    </PanelGroup>
  );
}
