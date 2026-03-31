"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  fontFamily: "Inter, sans-serif",
  flowchart: { curve: "basis", padding: 12 },
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

interface MermaidDiagramProps {
  content: string;
  title?: string;
  caption?: string;
}

export function MermaidDiagram({ content, title, caption }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (!ref.current) return;

    const render = async () => {
      try {
        const { svg } = await mermaid.render(idRef.current, content);
        if (ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch {
        setError(true);
      }
    };

    render();
  }, [content]);

  if (error) return null;

  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      {title && (
        <p className="text-xs font-semibold text-foreground mb-2">{title}</p>
      )}
      <div ref={ref} className="overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto" />
      {caption && (
        <p className="mt-2 text-xs text-muted-foreground italic">{caption}</p>
      )}
    </div>
  );
}
