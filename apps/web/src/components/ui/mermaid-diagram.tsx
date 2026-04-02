"use client";

import { useEffect, useRef, useState } from "react";

let mermaidInstance: typeof import("mermaid").default | null = null;
let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function getMermaid() {
  if (mermaidReady) return mermaidReady;
  mermaidReady = import("mermaid").then((mod) => {
    const m = mod.default;
    m.initialize({
      startOnLoad: false,
      theme: "neutral",
      fontFamily: "Inter, sans-serif",
      flowchart: { curve: "basis", padding: 12 },
      securityLevel: "loose",
      themeVariables: {
        primaryColor: "#4d9e8e",
        primaryTextColor: "#fff",
        primaryBorderColor: "#3d8e7e",
        lineColor: "#94a3b8",
        secondaryColor: "#f1f5f9",
        tertiaryColor: "#f8fafc",
        fontSize: "13px",
      },
    });
    mermaidInstance = m;
    return m;
  });
  return mermaidReady;
}

/** Clean up common AI-generated mermaid syntax issues */
function sanitizeMermaidContent(raw: string): string {
  let content = raw.trim();
  // Remove markdown code fences if AI wrapped it
  content = content.replace(/^```mermaid\s*/i, "").replace(/```\s*$/, "").trim();
  // Ensure it starts with a valid graph declaration
  if (!/^(graph|flowchart)\s+(TD|TB|LR|RL|BT)/i.test(content)) {
    content = "graph TD\n" + content;
  }
  // Replace flowchart with graph (some AI models use flowchart)
  content = content.replace(/^flowchart\s+/i, "graph ");
  // Remove subgraph blocks (common AI mistake that breaks simple diagrams)
  content = content.replace(/\s*subgraph\s+.*$/gm, "");
  content = content.replace(/\s*end\s*$/gm, "");
  // Fix common syntax issues: remove quotes inside brackets
  content = content.replace(/\[\"([^"]*)\"\]/g, "[$1]");
  content = content.replace(/\[\'([^']*)\'\]/g, "[$1]");
  // Remove problematic characters from labels: (), :, ;
  content = content.replace(/\[([^\]]*)\]/g, (match, label: string) => {
    const cleaned = label.replace(/[();:]/g, " ").replace(/\s+/g, " ").trim();
    return `[${cleaned}]`;
  });
  return content;
}

interface MermaidDiagramProps {
  content: string;
  title?: string;
  caption?: string;
}

// Global counter for unique IDs to avoid mermaid render collisions
let renderCounter = 0;

export function MermaidDiagram({ content, title, caption }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!ref.current || !content) {
      setError(true);
      setErrorMsg("No diagram content provided");
      return;
    }

    let cancelled = false;

    const render = async () => {
      try {
        const m = await getMermaid();
        if (cancelled) return;

        const sanitized = sanitizeMermaidContent(content);
        const uniqueId = `mermaid-${++renderCounter}-${Date.now()}`;

        const { svg } = await m.render(uniqueId, sanitized);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[MermaidDiagram] Render failed:", err, "\nContent:", content);
          setError(true);
          setErrorMsg(String(err).slice(0, 100));
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [content]);

  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      {title && title !== "Diagram" && (
        <p className="text-xs font-semibold text-foreground mb-2">{title}</p>
      )}
      {error ? (
        <div className="py-2">
          <p className="text-xs text-muted-foreground italic">Diagram could not be rendered.</p>
          {errorMsg && <p className="text-[10px] text-muted-foreground/50 mt-1">{errorMsg}</p>}
        </div>
      ) : (
        <div ref={ref} className="overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto" />
      )}
      {caption && (
        <p className="mt-2 text-xs text-muted-foreground italic">{caption}</p>
      )}
    </div>
  );
}
