# Batch 6: UI Polish — Make the Learner App Look Professional

> **PRIORITY**: HIGH — The app works functionally but looks like a prototype. This batch elevates it to a premium, polished learning experience.
> **ESTIMATED TIME**: 60-90 minutes
> **SCOPE**: `apps/web` only (learner app). Does NOT touch backend.

---

## Problem Summary

The learner app (Arena) currently looks like a developer prototype, not a professional learning platform. Specific issues:

1. **Text is microscopic** — `text-[10px]` and `text-[9px]` used everywhere. Unreadable on most screens.
2. **No Nexi avatar** — Just a tiny green "Nexi" text label. No visual identity for the AI tutor.
3. **Chat bubbles are flat** — Minimal visual distinction between Nexi and user messages.
4. **Input bar is cramped** — Tiny, feels like an afterthought.
5. **Left panel is plain** — No visual hierarchy, no engagement.
6. **Stage pills in the top bar are too small** — Hard to see which phase you're in.
7. **No typing indicator** — When Nexi is "thinking" before tokens arrive, there's no visual feedback.
8. **Timestamps are barely visible** — `text-[9px]` timestamps are useless.
9. **The overall feel is cold** — Needs warmth, breathing room, and subtle personality to match Nexi's warm teaching voice.
10. **Session complete card is basic** — Should feel celebratory.

---

## Design Principles for This Fix

- **Warm, not corporate** — Think Duolingo meets Notion. Friendly, clean, inviting.
- **Readable** — Minimum `text-xs` (12px) for body text, `text-sm` (14px) for messages.
- **Breathable** — More padding, more whitespace. Don't cram elements.
- **Nexi has a face** — Give the AI tutor a visual identity (gradient avatar).
- **Progressive disclosure** — Don't overwhelm. The chat is the hero; everything else supports it.

---

## Fix 1: Increase All Font Sizes — Kill Every `text-[9px]` and `text-[10px]`

**File**: `apps/web/src/app/session/[id]/page.tsx`

This is the single biggest readability improvement. Go through the ENTIRE file and replace:

- `text-[9px]` → `text-xs` (12px)
- `text-[10px]` → `text-xs` (12px)
- `text-xs` (on chat messages) → `text-sm` (14px)
- `text-xs` (on input placeholder) → `text-sm` (14px)

Specific replacements:

```
// Left panel — course description
"mt-1.5 text-[10px] text-muted-foreground" → "mt-1.5 text-xs text-muted-foreground"

// Left panel — "Session Phases" label
"text-[10px] uppercase tracking-wider" → "text-xs uppercase tracking-wider"

// Left panel — stage labels
"text-[10px]" (on stage.label spans) → "text-xs"

// Left panel — stage number circles
"h-5 w-5 ... text-[9px]" → "h-6 w-6 ... text-xs"

// Top bar — stage pills
"px-2.5 py-1 text-[10px]" → "px-3 py-1.5 text-xs"

// Top bar — voice toggle
"text-[10px]" → "text-xs"

// Top bar — "Score" label
"text-[10px] text-muted-foreground" → "text-xs text-muted-foreground"

// Chat messages — Nexi label
"text-[10px] font-semibold text-primary" → "text-xs font-semibold text-primary"

// Chat messages — message body
"text-xs leading-relaxed" (on the bubble div) → "text-sm leading-relaxed"

// Chat messages — prose overrides
"[&>p]:text-xs [&>ul]:text-xs [&>ol]:text-xs" → "[&>p]:text-sm [&>ul]:text-sm [&>ol]:text-sm"

// Chat messages — timestamps
"text-[9px] text-muted-foreground" → "text-xs text-muted-foreground"

// Input bar — text input
"text-xs text-foreground" → "text-sm text-foreground"

// Input bar — placeholder
"placeholder:text-muted-foreground" stays, but the input font size increases via the text-sm above

// Finish session button
"text-[10px]" → "text-xs"

// Demo session label
"text-[9px]" → "text-xs"

// Session complete card — all text-[10px] → text-xs
```

**Also apply the same treatment to these files:**

**File**: `apps/web/src/components/layout/global-context-bar.tsx`
```
// Replace all text-[10px] with text-xs
"text-[10px] text-muted-foreground" → "text-xs text-muted-foreground"
"text-[10px] font-medium text-success" → "text-xs font-medium text-success"
"text-[10px] font-semibold text-primary" → "text-xs font-semibold text-primary"
```

**File**: `apps/web/src/app/courses/page.tsx`
```
// All text-[10px] → text-xs
```

**File**: `apps/web/src/app/page.tsx` (Dashboard)
```
// All text-[10px] → text-xs
```

---

## Fix 2: Add a Nexi Avatar to Chat Messages

**File**: `apps/web/src/app/session/[id]/page.tsx`

Replace the plain "Nexi" text label with a gradient avatar circle. This gives Nexi a visual identity.

Find the Nexi message rendering (around line 302-327) and replace:

```tsx
// CURRENT:
{msg.role === "nexi" && (
  <div className="flex items-center justify-between mb-1">
    <p className="text-[10px] font-semibold text-primary">Nexi</p>
    ...speaker buttons...
  </div>
)}

// REPLACE WITH:
{msg.role === "nexi" && (
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-bold text-white">N</span>
      </div>
      <span className="text-xs font-semibold text-primary">Nexi</span>
    </div>
    ...speaker buttons (keep existing)...
  </div>
)}
```

Also add the avatar to the **streaming message** (around line 329-338):

```tsx
// In the streaming content block, add the avatar:
<div className="max-w-[80%]">
  <div className="rounded-2xl bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground">
    <div className="flex items-center gap-2 mb-2">
      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-bold text-white">N</span>
      </div>
      <span className="text-xs font-semibold text-primary">Nexi</span>
    </div>
    <div className="prose prose-sm max-w-none text-foreground [&>p]:mb-2 [&>p]:text-sm">
      <ReactMarkdown>{streamingContent}</ReactMarkdown>
    </div>
    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary rounded-full" />
  </div>
</div>
```

---

## Fix 3: Upgrade Chat Bubble Styling

**File**: `apps/web/src/app/session/[id]/page.tsx`

Make Nexi messages and user messages visually distinct and more polished.

Replace the message bubble classes:

```tsx
// CURRENT (Nexi bubble):
"rounded-2xl px-4 py-3 text-xs leading-relaxed relative group/msg bg-primary/5 text-foreground"

// REPLACE WITH:
"rounded-2xl px-5 py-4 text-sm leading-relaxed relative group/msg bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] border border-primary/10 text-foreground shadow-sm"

// CURRENT (User bubble):
"rounded-2xl px-4 py-3 text-xs leading-relaxed relative group/msg bg-muted text-foreground"

// REPLACE WITH:
"rounded-2xl px-5 py-4 text-sm leading-relaxed relative group/msg bg-card border border-border text-foreground shadow-sm"
```

Also update the outer message wrapper to handle user alignment better:

```tsx
// CURRENT:
<motion.div ... className={cn("max-w-[80%]", msg.role === "user" ? "ml-auto" : "")}>

// REPLACE WITH:
<motion.div ... className={cn("max-w-[75%]", msg.role === "user" ? "ml-auto" : "")}>
```

---

## Fix 4: Upgrade the Input Bar

**File**: `apps/web/src/app/session/[id]/page.tsx`

Make the input area feel substantial and inviting.

Replace the input bar section (around line 371-394):

```tsx
// CURRENT:
<div className="border-t border-border bg-card px-5 py-2.5">
  <div className="flex items-center gap-2">
    <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <input ... className="flex-1 bg-transparent text-xs ..." />
      <button ... className="rounded-md p-1.5 ..."><Mic className="h-3.5 w-3.5" /></button>
      <button className="rounded-md p-1.5 ..."><Lightbulb className="h-3.5 w-3.5" /></button>
      <button ... className="rounded-md bg-primary p-1.5 ..."><Send className="h-3.5 w-3.5" /></button>
    </div>

// REPLACE WITH:
<div className="border-t border-border bg-card px-5 py-3">
  <div className="flex items-center gap-3">
    <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
      <input ... className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50" />
      <button ... className="rounded-lg p-2 transition-colors"><Mic className="h-4 w-4" /></button>
      <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Lightbulb className="h-4 w-4" /></button>
      <button ... className="rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"><Send className="h-4 w-4" /></button>
    </div>
```

Also update the placeholder text to be more inviting:
```
placeholder="Type your response..." → placeholder="Reply to Nexi..."
```

And increase the icon sizes in the input bar from `h-3.5 w-3.5` to `h-4 w-4`.

---

## Fix 5: Add a Typing Indicator

**File**: `apps/web/src/app/session/[id]/page.tsx`

When `isStreaming` is true but `streamingContent` is empty (Nexi is thinking but hasn't started outputting tokens yet), show a typing indicator.

Add this right before the streaming content block (around line 329):

```tsx
{isStreaming && !streamingContent && (
  <div className="max-w-[75%]">
    <div className="rounded-2xl bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] border border-primary/10 px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-white">N</span>
        </div>
        <span className="text-xs font-semibold text-primary">Nexi</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
        <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
        <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  </div>
)}
```

---

## Fix 6: Polish the Left Panel

**File**: `apps/web/src/app/session/[id]/page.tsx`

Make the left panel feel more structured and visually appealing.

```tsx
// CURRENT left panel wrapper:
<div className="w-[260px] shrink-0 overflow-y-auto border-r border-border bg-surface p-4 scrollbar-none">

// REPLACE WITH:
<div className="w-[280px] shrink-0 overflow-y-auto border-r border-border bg-surface px-5 py-5 scrollbar-none">
```

Update the course title section:

```tsx
// CURRENT:
<h2 className="text-sm font-display font-semibold text-foreground">
  {courseInfo?.title || arenaSession.title}
</h2>
<p className="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
  {courseInfo?.description || arenaSession.description}
</p>

// REPLACE WITH:
<div className="flex items-start gap-3 mb-1">
  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
    <BookOpen className="h-5 w-5 text-primary" />
  </div>
  <div className="min-w-0">
    <h2 className="text-sm font-display font-semibold text-foreground leading-snug">
      {courseInfo?.title || arenaSession.title}
    </h2>
    <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-3">
      {courseInfo?.description || arenaSession.description}
    </p>
  </div>
</div>
```

Make sure to add `BookOpen` to the lucide-react imports at the top of the file:
```tsx
import { Send, Mic, Lightbulb, Layout, HelpCircle, Check, ChevronDown, X, Volume2, VolumeX, CheckCircle2, BookOpen } from "lucide-react";
```

Update the session phases section for better visual hierarchy:

```tsx
// CURRENT phase circles:
"h-5 w-5 rounded-full flex items-center justify-center text-[9px]"

// REPLACE WITH:
"h-7 w-7 rounded-full flex items-center justify-center text-xs"

// CURRENT phase labels:
"text-[10px]" → "text-xs"

// CURRENT "Session Phases" label:
"text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2"
→ "text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3"
```

Add a subtle separator between course info and phases:
```tsx
// After the course info div, before the phases div, add:
<div className="my-4 border-t border-border" />
```

---

## Fix 7: Upgrade the Top Stage Bar

**File**: `apps/web/src/app/session/[id]/page.tsx`

Make the stage indicator bar more substantial.

```tsx
// CURRENT:
<div className="flex items-center gap-2 border-b border-border bg-card px-5 py-2.5">

// REPLACE WITH:
<div className="flex items-center gap-2.5 border-b border-border bg-card px-5 py-3">
```

Update stage pills:
```tsx
// CURRENT:
<span ... className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium ...")}>

// REPLACE WITH:
<span ... className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-all ...")}>
```

Update the voice toggle:
```tsx
// CURRENT:
"flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"

// REPLACE WITH:
"flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
```

Update the voice icons:
```tsx
// CURRENT: <Volume2 className="h-3.5 w-3.5" />
// REPLACE WITH: <Volume2 className="h-4 w-4" />
```

---

## Fix 8: Polish the Thinking Scaffold Panel

**File**: `apps/web/src/app/session/[id]/page.tsx`

```tsx
// CURRENT scaffold header:
"text-[10px] uppercase tracking-wider text-muted-foreground font-medium"
→ "text-xs uppercase tracking-wider text-muted-foreground font-medium"

// CURRENT "Consider" label:
"text-[10px] uppercase tracking-wider text-primary font-medium"
→ "text-xs uppercase tracking-wider text-primary font-medium"

// CURRENT scaffold prompts:
"text-[10px] text-muted-foreground leading-relaxed"
→ "text-xs text-muted-foreground leading-relaxed"

// CURRENT tab buttons:
"text-[10px] font-medium" → "text-xs font-medium"

// CURRENT textarea:
"text-xs" → "text-sm"

// CURRENT save status:
"text-[10px]" → "text-xs"

// Increase scaffold panel width:
animate={{ width: 300 }} → animate={{ width: 320 }}
<div className="w-[300px]" → <div className="w-[320px]"
```

Also make the scaffold open button more visible:
```tsx
// CURRENT:
"absolute right-0 top-1/2 -translate-y-1/2 z-10 rounded-l-lg border border-r-0 border-border bg-card px-1.5 py-4"

// REPLACE WITH:
"absolute right-0 top-1/2 -translate-y-1/2 z-10 rounded-l-xl border border-r-0 border-border bg-card px-2 py-5 shadow-md"
```

---

## Fix 9: Polish the Session Complete Card

**File**: `apps/web/src/app/session/[id]/page.tsx`

Make the completion feel celebratory:

```tsx
// CURRENT session complete card:
<div className="rounded-lg border border-success/30 bg-success/5 p-4">
  <div className="flex items-center gap-2 mb-2">
    <CheckCircle2 className="h-4 w-4 text-success" />
    <span className="text-xs font-semibold text-foreground">Session Complete</span>
  </div>

// REPLACE WITH:
<div className="rounded-xl border border-success/30 bg-gradient-to-br from-success/10 to-success/5 p-5">
  <div className="flex items-center gap-3 mb-3">
    <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center">
      <CheckCircle2 className="h-5 w-5 text-success" />
    </div>
    <div>
      <span className="text-sm font-semibold text-foreground block">Session Complete!</span>
      <span className="text-xs text-muted-foreground">Great work on this session</span>
    </div>
  </div>
```

Update the strengths/improvements text:
```tsx
// All text-[10px] in the assessment area → text-xs
```

Update the "Back to Dashboard" link:
```tsx
// CURRENT:
"mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"

// REPLACE WITH:
"mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
```

---

## Fix 10: Add Subtle Animations to Chat

**File**: `apps/web/src/app/session/[id]/page.tsx`

Improve the message entrance animations:

```tsx
// CURRENT:
<motion.div key={msg.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>

// REPLACE WITH:
<motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
```

---

## Fix 11: Global Context Bar Polish

**File**: `apps/web/src/components/layout/global-context-bar.tsx`

Increase the bar height slightly and fix font sizes:

```tsx
// CURRENT:
"sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-card px-6"

// REPLACE WITH:
"sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-6"
```

Replace all `text-[10px]` with `text-xs` throughout the file.

Update icon sizes:
```tsx
// CURRENT: <Search className="h-3.5 w-3.5" />
// REPLACE WITH: <Search className="h-4 w-4" />

// CURRENT: <Bell className="h-3.5 w-3.5" />
// REPLACE WITH: <Bell className="h-4 w-4" />
```

Update the avatar:
```tsx
// CURRENT:
"flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px]"

// REPLACE WITH:
"flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs"
```

---

## Fix 12: Courses Page Polish

**File**: `apps/web/src/app/courses/page.tsx`

Replace all `text-[10px]` with `text-xs` throughout.

Update card padding:
```tsx
// "p-5" on course cards → "p-6"
```

---

## Fix 13: Dashboard Page Polish

**File**: `apps/web/src/app/page.tsx`

Replace all `text-[10px]` with `text-xs` throughout.

---

## Fix 14: Add Smooth Scroll Behavior to Chat

**File**: `apps/web/src/app/globals.css`

Add smooth scrolling for the chat area:

```css
/* Add to @layer utilities */
.scroll-smooth {
  scroll-behavior: smooth;
}
```

**File**: `apps/web/src/app/session/[id]/page.tsx`

Add `scroll-smooth` to the chat scroll container:
```tsx
// CURRENT:
<div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-none">

// REPLACE WITH:
<div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 scrollbar-none scroll-smooth">
```

---

## Fix 15: Update the Session Page Layout Height

**File**: `apps/web/src/app/session/[id]/page.tsx`

The layout uses `h-12` (3rem) for the context bar but we changed it to `h-14` (3.5rem):

```tsx
// CURRENT:
<div className="flex h-[calc(100vh-3rem)]">

// REPLACE WITH:
<div className="flex h-[calc(100vh-3.5rem)]">
```

---

## Summary of All Files to Touch

1. `apps/web/src/app/session/[id]/page.tsx` — Main session page (Fixes 1-10, 14-15)
2. `apps/web/src/components/layout/global-context-bar.tsx` — Top bar (Fixes 1, 11)
3. `apps/web/src/app/courses/page.tsx` — Courses page (Fixes 1, 12)
4. `apps/web/src/app/page.tsx` — Dashboard (Fixes 1, 13)
5. `apps/web/src/app/globals.css` — Global styles (Fix 14)

---

## Verification (MANDATORY)

After applying all fixes, verify:

```bash
# 1. Start the dev server
cd apps/web && npm run dev

# 2. Check the session page:
#    - All text is readable (no squinting at 9-10px text)
#    - Nexi messages have a gradient avatar (circle with "N")
#    - Chat bubbles have subtle borders and shadows
#    - Input bar is substantial with proper focus ring
#    - Typing indicator shows before Nexi's first token arrives
#    - Voice toggle is clearly visible and labeled

# 3. Check the left panel:
#    - Course title has a book icon next to it
#    - Phase indicators are larger and clearer
#    - Good visual hierarchy

# 4. Check the top stage bar:
#    - Stage pills are larger and more readable
#    - Active stage is clearly highlighted

# 5. Check the courses page:
#    - All text is readable
#    - Cards have breathing room

# 6. Check the dashboard:
#    - All text is readable
#    - Overall layout feels polished

# 7. Complete a session and verify the completion card:
#    - Shows celebratory design with large check icon
#    - "Back to Dashboard" is a proper button, not a tiny link
```

## Done Criteria
- No `text-[9px]` or `text-[10px]` anywhere in the learner app
- Nexi has a gradient avatar in all chat messages
- Chat bubbles have subtle borders and shadows
- Input bar has focus ring and is at least 14px font
- Typing indicator appears before streaming starts
- Session complete card feels celebratory
- Overall app feels like a polished product, not a prototype
