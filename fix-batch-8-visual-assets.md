# Batch 8: Visual Assets — Diagrams, Charts & On-the-Fly Visuals in Teaching Sessions

> **PRIORITY**: HIGH — Transforms the teaching experience from text-only to a rich, visual learning environment.
> **ESTIMATED TIME**: 2-3 hours
> **SCOPE**: Backend (`services/api`) + Frontend (`apps/web`)
> **DEPENDS ON**: Batch 7 (course outline + topic tracking) — already applied.

---

## What This Adds

Two complementary visual systems:

### 1. Pre-generated Visuals (during course ingestion)
When a course outline is generated, Claude also creates supporting visuals for each topic — Mermaid diagrams (flowcharts, concept maps, mind maps) and chart specifications (bar, pie, line). These are stored in the outline and displayed in the left panel or inline in chat when Nexi reaches that topic.

### 2. On-the-fly Visuals (during live teaching)
When Nexi detects a teaching moment that benefits from a visual — a comparison, a process, a data breakdown — it emits a special `visual` block in its response. The frontend detects it and renders it inline in the chat.

---

## Part A: Pre-generated Visuals in Course Outline

### A1. Update the outline generation prompt

**File**: `services/api/app/services/course_generator.py`

Replace the existing `OUTLINE_PROMPT` with one that also generates visuals per topic:

```python
OUTLINE_PROMPT = """You are a curriculum designer for an adaptive learning platform. Given course content and AI-generated metadata, create a detailed TEACHING OUTLINE with supporting visuals.

This outline will be used by an AI tutor to systematically walk a learner through the material. Each section should:
1. Cover ONE coherent topic
2. Be teachable in 3-6 conversational exchanges
3. Build on the previous section
4. Have clear learning objectives
5. Include 1-2 supporting visuals (diagrams, charts, or concept maps)

Return ONLY valid JSON — an array of sections in teaching order:
[
  {
    "id": 1,
    "title": "Section title — clear and specific",
    "description": "What the learner will understand after this section (1-2 sentences)",
    "key_concepts": ["concept1", "concept2", "concept3"],
    "estimated_exchanges": 4,
    "prerequisite_ids": [],
    "visuals": [
      {
        "type": "mermaid",
        "title": "Descriptive title for the diagram",
        "caption": "One sentence explaining what this diagram shows",
        "content": "graph TD\\n  A[Step 1] --> B[Step 2]\\n  B --> C[Step 3]"
      }
    ]
  }
]

VISUAL RULES:
- Each topic should have 1-2 visuals. At least ONE visual per topic.
- Visual types:
  - "mermaid": For flowcharts, process diagrams, decision trees, mind maps, sequence diagrams.
    Use Mermaid.js syntax. Keep diagrams simple (5-10 nodes max). Use short, clear labels.
    Supported diagram types: graph TD, graph LR, flowchart TD, sequenceDiagram, pie, mindmap
  - "chart": For data comparisons, distributions, trends.
    Include chart_type ("bar", "pie", "line", "radar") and a "data" array.
    Example: {"type": "chart", "title": "Market Share", "chart_type": "pie", "caption": "...", "data": [{"name": "Segment A", "value": 45}, {"name": "Segment B", "value": 30}, {"name": "Segment C", "value": 25}]}
  - "table": For comparisons, feature matrices, before/after.
    Include "headers" (array of strings) and "rows" (array of arrays).
    Example: {"type": "table", "title": "B2B vs B2C", "caption": "...", "headers": ["Factor", "B2B", "B2C"], "rows": [["Sales Cycle", "Long", "Short"], ["Decision Maker", "Committee", "Individual"]]}

- Make visuals SPECIFIC to the course content, not generic templates.
- Mermaid diagrams must use valid Mermaid.js syntax. Test mentally that the diagram parses.
- For mermaid: escape special characters in labels. Avoid parentheses inside node labels — use square brackets [].
- Charts should have realistic, illustrative data that supports the teaching point.
- Tables should be concise: 3-6 rows max.

OTHER RULES:
- Create 5-12 sections depending on content depth
- First section should be foundational/introductory
- Last section should be synthesis/application
- Each section title should be specific, not generic (e.g., "Understanding Customer Acquisition Cost" not "Marketing Metrics")
- key_concepts should be 2-5 specific terms/ideas the learner needs to grasp
- estimated_exchanges is typically 3-6 (short sections keep engagement high)
"""
```

### A2. Update the `generate_course_outline` function

Same file. The function itself doesn't need to change much, but increase `max_tokens` to accommodate visuals:

```python
async def generate_course_outline(text_content: str, metadata: dict) -> list[dict]:
    """Generate a structured teaching outline with visuals from course content."""
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    context = f"""COURSE METADATA:
Title: {metadata.get('title', 'Unknown')}
Description: {metadata.get('description', '')}
Topics: {json.dumps(metadata.get('topics', []))}
Mastery Criteria: {json.dumps(metadata.get('mastery_criteria', []))}
Domains: {json.dumps(metadata.get('domains', []))}

COURSE CONTENT (first 30000 chars):
{text_content[:30000]}
"""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,  # Increased for visual content
        system=OUTLINE_PROMPT,
        messages=[{"role": "user", "content": context}],
    )

    text = response.content[0].text
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    outline = json.loads(text.strip())

    for i, section in enumerate(outline):
        section["id"] = i + 1
        # Ensure visuals array exists even if Claude forgot
        if "visuals" not in section:
            section["visuals"] = []

    return outline
```

### A3. Validate Mermaid syntax (optional but recommended)

Add a simple validator that catches obviously broken Mermaid syntax before storing:

```python
def _validate_mermaid(content: str) -> bool:
    """Basic validation that Mermaid content has a valid diagram type declaration."""
    content = content.strip()
    valid_starts = ["graph ", "flowchart ", "sequenceDiagram", "pie", "mindmap", "classDiagram", "stateDiagram"]
    return any(content.startswith(s) for s in valid_starts)


def _sanitize_visuals(visuals: list[dict]) -> list[dict]:
    """Remove visuals with invalid Mermaid syntax."""
    sanitized = []
    for v in visuals:
        if v.get("type") == "mermaid":
            if v.get("content") and _validate_mermaid(v["content"]):
                sanitized.append(v)
        elif v.get("type") in ("chart", "table"):
            sanitized.append(v)
    return sanitized
```

Call `_sanitize_visuals` on each section's visuals in `generate_course_outline` before returning:

```python
    for i, section in enumerate(outline):
        section["id"] = i + 1
        section["visuals"] = _sanitize_visuals(section.get("visuals", []))

    return outline
```

---

## Part B: On-the-fly Visual Generation During Teaching

### B1. Update the Nexi system prompt to emit visual blocks

**File**: `services/api/app/services/nexi_engine.py`

Add this section to the end of `NEXI_SYSTEM_PROMPT` (before the closing triple-quote):

```python
# Add this to NEXI_SYSTEM_PROMPT, right before the closing """

VISUAL AIDS:
When explaining a concept that would benefit from a visual, you can include a visual block in your response. Use this format EXACTLY:

[VISUAL:mermaid]
graph TD
  A[Identify Problem] --> B[Research Solutions]
  B --> C[Evaluate Options]
  C --> D[Implement]
[/VISUAL]

Or for a comparison table:

[VISUAL:table|Title of Table]
Header1 | Header2 | Header3
Row1Col1 | Row1Col2 | Row1Col3
Row2Col1 | Row2Col2 | Row2Col3
[/VISUAL]

Rules for inline visuals:
- Use visuals SPARINGLY — at most once per response, and only when they genuinely clarify the concept.
- Keep Mermaid diagrams simple: 4-8 nodes max.
- Keep tables concise: 2-5 rows max.
- The visual should complement your verbal explanation, not replace it. Always explain the key takeaway AFTER the visual.
- Don't use visuals for simple concepts that are easy to explain verbally.
- Good uses: process flows, comparisons, decision trees, hierarchies, before/after contrasts.
```

### B2. Parse visual blocks from Nexi's response

**File**: `services/api/app/routers/conversations.py`

Add a function that extracts visual blocks from Nexi's response and sends them as separate WebSocket events:

```python
import re

def _extract_visuals_from_response(response: str) -> tuple[str, list[dict]]:
    """Extract [VISUAL:...] blocks from Nexi's response.

    Returns (cleaned_text, list_of_visual_dicts)
    """
    visuals = []

    # Match [VISUAL:type] ... [/VISUAL] blocks
    pattern = r'\[VISUAL:(mermaid|table)(?:\|([^\]]*))?\]\s*(.*?)\s*\[/VISUAL\]'
    matches = re.findall(pattern, response, re.DOTALL)

    for visual_type, title, content in matches:
        if visual_type == "mermaid":
            visuals.append({
                "type": "mermaid",
                "title": title.strip() if title else "Diagram",
                "content": content.strip(),
            })
        elif visual_type == "table":
            # Parse pipe-separated table
            lines = [l.strip() for l in content.strip().split("\n") if l.strip()]
            if len(lines) >= 2:
                headers = [h.strip() for h in lines[0].split("|")]
                rows = [[c.strip() for c in row.split("|")] for row in lines[1:]]
                visuals.append({
                    "type": "table",
                    "title": title.strip() if title else "Comparison",
                    "headers": headers,
                    "rows": rows,
                })

    # Remove visual blocks from the text (so the chat message is clean)
    cleaned = re.sub(pattern, '', response, flags=re.DOTALL).strip()
    # Clean up any double newlines left behind
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

    return cleaned, visuals
```

### B3. Send visuals as WebSocket events

In the WebSocket handler, after Nexi's response is complete, extract and send visuals.

Find the `assistant_complete` send in both `session_start` and `user_message` handlers, and add visual extraction:

**In `session_start`** (after `full_response` is built, around the `assistant_complete` send):

```python
                    # Extract any inline visuals from Nexi's response
                    cleaned_response, inline_visuals = _extract_visuals_from_response(full_response)

                    conversation.messages = [{"role": "assistant", "content": cleaned_response, "timestamp": datetime.now(timezone.utc).isoformat()}]
                    flag_modified(conversation, "messages")
                    flag_modified(conversation, "topics_covered")
                    await db.commit()

                    await websocket.send_json({"type": "assistant_complete", "content": cleaned_response})

                    # Send inline visuals
                    for visual in inline_visuals:
                        await websocket.send_json({"type": "inline_visual", **visual})

                    # Send pre-generated visuals for the current topic
                    if course_outline:
                        current_section = next((s for s in course_outline if s["id"] == 1), None)
                        if current_section and current_section.get("visuals"):
                            for visual in current_section["visuals"]:
                                await websocket.send_json({"type": "topic_visual", **visual})
```

**In `user_message`** (after `assistant_complete` send):

```python
                    # Extract inline visuals
                    cleaned_response, inline_visuals = _extract_visuals_from_response(full_response)

                    await websocket.send_json({"type": "assistant_complete", "content": cleaned_response})

                    # Send inline visuals
                    for visual in inline_visuals:
                        await websocket.send_json({"type": "inline_visual", **visual})

                    # Detect topic transition
                    new_topic_id, new_topics_covered = _detect_topic_transition(
                        cleaned_response, course_outline, current_topic_id, topics_covered
                    )

                    # If topic changed, send pre-generated visuals for the NEW topic
                    if course_outline and new_topic_id != current_topic_id:
                        new_section = next((s for s in course_outline if s["id"] == new_topic_id), None)
                        if new_section and new_section.get("visuals"):
                            for visual in new_section["visuals"]:
                                await websocket.send_json({"type": "topic_visual", **visual})

                    # ... rest of the handler (update conversation tracking, persist, etc.)
                    # IMPORTANT: Use cleaned_response (without visual blocks) for persistence
                    messages = list(conversation.messages or [])
                    messages.append({"role": "assistant", "content": cleaned_response, "timestamp": datetime.now(timezone.utc).isoformat()})
```

---

## Part C: Frontend — Render Visuals

### C1. Install Mermaid.js

```bash
cd apps/web
npm install mermaid
```

### C2. Create a MermaidDiagram component

**File**: `apps/web/src/components/ui/mermaid-diagram.tsx` (NEW FILE)

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  fontFamily: "Inter, sans-serif",
  flowchart: { curve: "basis", padding: 12 },
  themeVariables: {
    primaryColor: "#4d9e8e",      // matches your --primary
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

  if (error) return null; // Silently skip broken diagrams

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
```

### C3. Create a DataChart component

**File**: `apps/web/src/components/ui/data-chart.tsx` (NEW FILE)

Uses Recharts (already available in the project):

```tsx
"use client";

import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#4d9e8e", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef4444", "#10b981"];

interface DataChartProps {
  chart_type: "bar" | "pie" | "line" | "radar";
  data: Array<{ name: string; value: number; [key: string]: unknown }>;
  title?: string;
  caption?: string;
}

export function DataChart({ chart_type, data, title, caption }: DataChartProps) {
  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      {title && (
        <p className="text-xs font-semibold text-foreground mb-3">{title}</p>
      )}
      <ResponsiveContainer width="100%" height={200}>
        {chart_type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : chart_type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#4d9e8e" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
      {caption && (
        <p className="mt-2 text-xs text-muted-foreground italic">{caption}</p>
      )}
    </div>
  );
}
```

### C4. Create a ComparisonTable component

**File**: `apps/web/src/components/ui/comparison-table.tsx` (NEW FILE)

```tsx
interface ComparisonTableProps {
  headers: string[];
  rows: string[][];
  title?: string;
  caption?: string;
}

export function ComparisonTable({ headers, rows, title, caption }: ComparisonTableProps) {
  return (
    <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm overflow-x-auto">
      {title && (
        <p className="text-xs font-semibold text-foreground mb-3">{title}</p>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-2 px-3 font-semibold text-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="py-2 px-3 text-muted-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && (
        <p className="mt-2 text-xs text-muted-foreground italic">{caption}</p>
      )}
    </div>
  );
}
```

### C5. Handle visual WebSocket messages in the arena socket hook

**File**: `apps/web/src/hooks/useArenaSocket.ts`

Add visual state and handlers:

```typescript
// Add to interfaces at the top:
interface VisualAsset {
  id: string;
  type: "mermaid" | "chart" | "table";
  title?: string;
  caption?: string;
  content?: string;        // For mermaid
  chart_type?: string;     // For chart
  data?: Array<{ name: string; value: number }>;  // For chart
  headers?: string[];      // For table
  rows?: string[][];       // For table
  source: "topic" | "inline";  // Pre-generated or on-the-fly
}

// Add to state:
const [visuals, setVisuals] = useState<VisualAsset[]>([]);
let visualCounter = useRef(0);

// Add to the switch statement in ws.onmessage:
        case "topic_visual":
          setVisuals((prev) => [...prev, {
            id: `visual-${++visualCounter.current}`,
            ...data,
            source: "topic",
          }]);
          break;

        case "inline_visual":
          setVisuals((prev) => [...prev, {
            id: `visual-${++visualCounter.current}`,
            ...data,
            source: "inline",
          }]);
          break;

// Add visuals to the return:
return { messages, isConnected, isStreaming, streamingContent, scaffold, currentMode,
         courseOutline, currentTopicId, topicsCovered, visuals,
         sendMessage, connect, disconnect };
```

Update the `UseArenaSocketReturn` interface to include `visuals: VisualAsset[]`.

### C6. Render visuals in the session page

**File**: `apps/web/src/app/session/[id]/page.tsx`

**Import the new components at the top:**

```tsx
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import { DataChart } from "@/components/ui/data-chart";
import { ComparisonTable } from "@/components/ui/comparison-table";
```

**Destructure `visuals` from the hook:**

```tsx
const { messages: liveMessages, isStreaming, streamingContent, scaffold, currentMode,
        sendMessage, connect, courseOutline, currentTopicId, topicsCovered, visuals } = useArenaSocket();
```

**Render inline visuals after each Nexi message.** Update the message rendering loop to show visuals that appeared right after a Nexi message:

```tsx
{allMessages.map((msg, msgIndex) => (
  <React.Fragment key={msg.id}>
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className={cn("max-w-[75%]", msg.role === "user" ? "ml-auto" : "")}>
      {/* ... existing message bubble code ... */}
    </motion.div>

    {/* Render any visuals that came after this Nexi message */}
    {msg.role === "nexi" && visuals
      .filter((v) => {
        // Show visuals that were emitted around the time of this message
        // Simple heuristic: show visuals indexed near this message index
        const visualIdx = parseInt(v.id.split("-")[1]) || 0;
        const nextNexiIdx = allMessages.findIndex((m, i) => i > msgIndex && m.role === "nexi");
        const nexiMsgCount = allMessages.filter((m, i) => i <= msgIndex && m.role === "nexi").length;
        return visualIdx === nexiMsgCount;
      })
      .map((visual) => (
        <motion.div key={visual.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="max-w-[85%]">
          {visual.type === "mermaid" && visual.content && (
            <MermaidDiagram content={visual.content} title={visual.title} caption={visual.caption} />
          )}
          {visual.type === "chart" && visual.data && (
            <DataChart chart_type={(visual.chart_type as "bar" | "pie" | "line") || "bar"} data={visual.data} title={visual.title} caption={visual.caption} />
          )}
          {visual.type === "table" && visual.headers && visual.rows && (
            <ComparisonTable headers={visual.headers} rows={visual.rows} title={visual.title} caption={visual.caption} />
          )}
        </motion.div>
      ))
    }
  </React.Fragment>
))}
```

**NOTE:** The visual-to-message association above is a simple heuristic. A more robust approach: track visuals by associating each one with the Nexi message ID it belongs to. To do this, send the message counter along with the visual event from the backend, or simply append visuals to the messages array with a special role like `"visual"`.

**SIMPLER ALTERNATIVE — Append visuals as special messages:**

Instead of the complex filtering above, just treat visuals as special chat messages:

In `useArenaSocket.ts`, when you receive `inline_visual` or `topic_visual`:

```typescript
        case "topic_visual":
        case "inline_visual":
          setMessages((prev) => [...prev, {
            id: `visual-${++msgIdCounter.current}`,
            role: "nexi" as const,
            content: JSON.stringify({ _visual: true, ...data }),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }]);
          break;
```

Then in the session page, detect visual messages:

```tsx
{allMessages.map((msg) => {
  // Check if this is a visual message
  let visualData: any = null;
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed._visual) visualData = parsed;
  } catch {}

  if (visualData) {
    return (
      <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-[85%]">
        {visualData.type === "mermaid" && visualData.content && (
          <MermaidDiagram content={visualData.content} title={visualData.title} caption={visualData.caption} />
        )}
        {visualData.type === "chart" && visualData.data && (
          <DataChart chart_type={visualData.chart_type || "bar"} data={visualData.data} title={visualData.title} caption={visualData.caption} />
        )}
        {visualData.type === "table" && visualData.headers && visualData.rows && (
          <ComparisonTable headers={visualData.headers} rows={visualData.rows} title={visualData.title} caption={visualData.caption} />
        )}
      </motion.div>
    );
  }

  // Regular message rendering (existing code)
  return (
    <motion.div key={msg.id} ...>
      {/* existing message bubble code */}
    </motion.div>
  );
})}
```

**USE THE SIMPLER ALTERNATIVE** — it's cleaner and avoids complex index tracking.

### C7. Show pre-generated visuals in the left panel

**File**: `apps/web/src/app/session/[id]/page.tsx`

In the course outline section of the left panel, show a visual indicator when a topic has visuals:

Update the topic list item rendering (inside the `courseOutline.map` block):

```tsx
<div className="min-w-0">
  <span className={cn(
    "text-xs leading-snug block",
    isCurrent ? "font-semibold text-foreground" :
    isCovered ? "text-muted-foreground line-through" :
    "text-muted-foreground/50"
  )}>
    {section.title}
  </span>
  {isCurrent && section.description && (
    <span className="text-xs text-muted-foreground mt-0.5 block leading-relaxed">
      {section.description}
    </span>
  )}
  {/* Visual indicator */}
  {section.visuals && section.visuals.length > 0 && (
    <span className="inline-flex items-center gap-1 mt-1 text-xs text-primary/60">
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 15l5-5 4 4 8-8" />
      </svg>
      {section.visuals.length} visual{section.visuals.length > 1 ? "s" : ""}
    </span>
  )}
</div>
```

Also update the `OutlineSection` interface in `useArenaSocket.ts` to include visuals:

```typescript
interface OutlineSection {
  id: number;
  title: string;
  description: string;
  key_concepts: string[];
  estimated_exchanges: number;
  visuals?: Array<{
    type: string;
    title?: string;
    caption?: string;
    content?: string;
    chart_type?: string;
    data?: Array<{ name: string; value: number }>;
    headers?: string[];
    rows?: string[][];
  }>;
}
```

---

## Part D: Regenerate Outlines for Existing Courses

The existing `/api/admin/courses/{course_id}/generate-outline` endpoint will now automatically generate visuals since we updated the prompt. Just call it for any existing courses:

```bash
curl -X POST http://localhost:8000/api/admin/courses/{COURSE_ID}/generate-outline \
  -H "Authorization: Bearer dev:auth0|admin-james"
```

---

## Verification (MANDATORY)

### 1. Regenerate outline for existing course

```bash
curl -X POST http://localhost:8000/api/admin/courses/{COURSE_ID}/generate-outline \
  -H "Authorization: Bearer dev:auth0|admin-james" | python -m json.tool
```

Verify:
- Each topic in the outline has a `visuals` array
- Visuals include Mermaid diagrams with valid syntax
- Some topics have charts or tables
- Visual titles and captions make sense for the topic

### 2. Start a session and check pre-generated visuals

Open a session in the browser:
- When Nexi starts teaching topic 1, the pre-generated visuals for topic 1 should appear in chat
- When Nexi transitions to topic 2, topic 2's visuals should appear
- Mermaid diagrams render as actual flowcharts/diagrams (not raw text)
- Charts render with colored bars/pies (not JSON)
- Tables render as actual HTML tables

### 3. Test on-the-fly visuals

Have a conversation where Nexi naturally creates a comparison or process flow:
- Ask Nexi to compare two concepts
- Nexi should emit a `[VISUAL:table]` block
- The table should render inline in chat after the message
- The raw `[VISUAL:...]` markup should NOT appear in the message text

### 4. Left panel visual indicators

Check the course outline in the left panel:
- Topics with visuals show a small chart icon and count (e.g., "2 visuals")

### 5. Mobile/overflow check

- Make sure diagrams don't overflow the chat area
- Charts should be responsive
- Tables should scroll horizontally if too wide

---

## Done Criteria

- [ ] `OUTLINE_PROMPT` generates visuals (mermaid, chart, table) per topic
- [ ] `max_tokens` increased to 8192 to accommodate visual JSON
- [ ] Mermaid syntax is validated before storing
- [ ] Nexi system prompt includes `[VISUAL:...]` block format instructions
- [ ] `_extract_visuals_from_response()` parses and removes visual blocks from text
- [ ] WebSocket sends `topic_visual` events for pre-generated visuals on topic transition
- [ ] WebSocket sends `inline_visual` events for on-the-fly visuals
- [ ] `MermaidDiagram` component renders Mermaid.js diagrams
- [ ] `DataChart` component renders bar/pie/line charts via Recharts
- [ ] `ComparisonTable` component renders structured tables
- [ ] Visuals appear inline in chat after Nexi messages
- [ ] Left panel shows visual indicators per topic
- [ ] Existing courses can regenerate outlines with visuals via admin endpoint
- [ ] No raw `[VISUAL:...]` markup visible to the user
