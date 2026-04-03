# Arena-Akash: Wire Arena-Thought Frontend to Mastery Backend

## MISSION
Replace the Mastery learner frontend (`apps/web`) with the arena-thought UI design, fully wired to the existing Mastery FastAPI backend. Every feature from BOTH codebases must work. Zero breakages. Every feature tested.

---

## CRITICAL RULES — READ BEFORE TOUCHING ANYTHING

- **Create branch first**: `git checkout -b Arena-Akash` from main
- Do NOT touch `services/api/` routers or models unless adding NEW endpoints (never modify existing ones)
- Do NOT touch `apps/admin/` at all — it stays exactly as-is
- Do NOT remove dev auth tokens: `dev:auth0|learner-maria` and `dev:auth0|admin-james` are INTENTIONAL
- Do NOT change `API_BASE` from `http://localhost:8000`
- `DEV_AUTH=true` in `services/api/.env` must stay
- The admin app (`apps/admin`, port 3001) must still work after all changes
- Start ALL servers before testing:
  - `cd services/api && uvicorn app.main:app --port 8000 --reload`
  - `cd apps/web && npm run dev` (port 3000)
  - `cd apps/admin && npm run dev` (port 3001)
- **VERIFY EVERY FEATURE** — run it, see it work, show proof. "I wrote the code" is NOT done.

---

## PHASE 0: Setup & Branch

```bash
cd /path/to/Mastery
git checkout main
git pull
git checkout -b Arena-Akash

# Install arena-thought's additional dependencies in apps/web
cd apps/web
npm install react-resizable-panels sonner
# Verify existing deps: framer-motion, lucide-react, mermaid should already be there
npm ls react-resizable-panels sonner framer-motion lucide-react mermaid
```

### VERIFY:
```bash
git branch --show-current  # Must show "Arena-Akash"
```

---

## PHASE 1: New Layout Architecture

### What we're building:
The arena-thought workspace has a 3-pane resizable layout:
- **Left**: Sources pane (course materials organized by module — collapsible to icon rail)
- **Center**: Nexi chat pane (the AI tutor conversation — always dominant)
- **Right**: Notebook pane (saved notes + vocabulary — collapsible to icon rail)

Plus these standalone pages:
- **Home/Dashboard** (`/`) — greeting, continue learning, recent workspaces, upcoming tasks
- **Library** (`/library` or `/courses`) — course grid with search/filter/enroll
- **Notebook** (`/notebook`) — full-page notebook view
- **Progress** (`/progress`) — analytics dashboard
- **Profile** (`/profile`) — user profile + mastery data
- **Settings** (`/settings`) — org/user settings
- **Study Plan** (`/study-plan`) — task management
- **Reflections** (`/reflections`) — learning journal
- **Session/Workspace** (`/workspace/:id` or `/session/:id`) — the 3-pane workspace

### 1.1 Create the Workspace layout component

**File:** `apps/web/src/components/workspace/WorkspaceLayout.tsx`

This is the core 3-pane layout using `react-resizable-panels`. Follow the arena-thought `Workspace.tsx` pattern exactly:
- `ResizablePanelGroup` with `direction="horizontal"`
- Sources panel (left) with 3 modes: `mini` (icon rail ~3.2%), `list` (~15%), `viewer` (~32%)
- Nexi panel (center) with `minSize={35}` — always dominant
- Notebook panel (right) with 2 states: `mini` (icon rail ~3.2%), `expanded` (~18%)
- Animated transitions: `style={{ transition: "flex 280ms cubic-bezier(0.16, 1, 0.3, 1)" }}`
- Resize handles that hide when adjacent panel is in mini mode
- When sources enters viewer mode, auto-collapse notebook to mini

### 1.2 Create the app sidebar/navigation

**File:** `apps/web/src/components/AppSidebar.tsx`

Navigation links:
- Dashboard (`/`)
- Courses (`/courses`)
- Sessions (`/sessions`) — list of past sessions
- Analytics (`/analytics`)
- Journal (`/journal`)
- Profile (`/profile`)

Bottom: user avatar + name from `/api/auth/me`

### 1.3 Create the Layout wrapper

**File:** `apps/web/src/components/Layout.tsx`

Wraps all pages with the sidebar. The workspace page (`/session/:id`) uses the full-width 3-pane layout WITHOUT the sidebar (or with a collapsed mini sidebar).

### 1.4 Update app routing

**File:** `apps/web/src/app/` (Next.js app router)

Ensure these routes exist:
- `/` → Dashboard
- `/courses` → Library/Courses
- `/session/[id]` → Workspace (3-pane)
- `/sessions` → Session history
- `/analytics` → Progress/Analytics
- `/journal` → Reflections/Journal
- `/profile` → Profile
- `/settings` → Settings

### VERIFY Phase 1:
```bash
cd apps/web && npx tsc --noEmit && echo "PASS"
cd apps/web && npm run dev &
sleep 8
curl -s http://localhost:3000 | grep -c "html" # Should be > 0
```

---

## PHASE 2: Sources Pane — Wired to Real Backend

### What this does:
Shows the actual course materials (uploaded PDFs, docs, etc.) organized by module/topic, with an inline document viewer. When a source is selected, Nexi's context shows "Grounded in: [source name]".

### 2.1 Backend: Add source materials endpoint

**File:** `services/api/app/routers/courses.py`

Add a NEW endpoint (do NOT modify existing ones):

```python
@router.get("/{course_id}/materials")
async def get_course_materials(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get course materials organized by outline topic."""
    course = (await db.execute(
        select(Course).where(Course.id == course_id, Course.org_id == current_user.org_id)
    )).scalar_one_or_none()
    if not course:
        raise HTTPException(404, "Course not found")

    # Get uploaded files for this course
    files = (await db.execute(
        select(UploadedFile).where(UploadedFile.course_id == course_id)
    )).scalars().all()

    # Get content chunks organized by topic
    chunks = (await db.execute(
        select(ContentChunk)
        .where(ContentChunk.course_id == course_id)
        .order_by(ContentChunk.chunk_index)
    )).scalars().all()

    outline = course.course_outline or []
    materials = []
    for section in outline:
        section_chunks = [c for c in chunks if c.topic_id == section.get("id")]
        materials.append({
            "topic_id": section.get("id"),
            "topic_title": section.get("title"),
            "chunks": [{"id": str(c.id), "content": c.content, "source_file": c.source_file, "chunk_index": c.chunk_index} for c in section_chunks],
        })

    return {
        "course_id": str(course_id),
        "title": course.title,
        "outline": outline,
        "files": [{"id": str(f.id), "filename": f.filename, "file_type": f.file_type, "uploaded_at": str(f.uploaded_at)} for f in files],
        "materials": materials,
    }
```

**IMPORTANT**: Check if `UploadedFile` and `ContentChunk` models exist. If not, adapt the query to whatever model stores ingested content. Search for:
```bash
grep -rn "class ContentChunk\|class UploadedFile\|class CourseChunk\|class Embedding" services/api/app/models/
```

Use whatever model actually stores the chunked course content.

### 2.2 Frontend: SourcesPane component

**File:** `apps/web/src/components/workspace/SourcesPane.tsx`

Follow arena-thought's design but wire to real data:
- **Mini mode**: Icon rail with source type icons (PDF, video, doc, etc.)
- **List mode**: Materials grouped by topic/module, fetched from `/api/courses/{courseId}/materials`
- **Viewer mode**: Shows actual chunk content when a source is selected
- Source metadata strip: file type icon, module name, reading time estimate
- When a source is selected, pass its `chunk_id` to the Nexi pane so responses can be "grounded in" that source

Use the `apiClient` pattern from the existing codebase:
```typescript
// In api-client.ts, add:
async getCourseMaterials(courseId: string) {
  return this.fetch<CourseMaterials>(`/api/courses/${courseId}/materials`);
}
```

### 2.3 Source type icons and labels

Map file types to icons exactly as arena-thought does:
```typescript
const typeIcon: Record<string, LucideIcon> = {
  pdf: FileType,
  docx: FileText,
  pptx: Presentation,
  video: Video,
  lecture: BookOpen,
  reading: FileText,
  code: Code,
  link: LinkIcon,
};
```

### VERIFY Phase 2:
```bash
# Backend endpoint works
curl -s http://localhost:8000/api/courses \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python3 -c "
import sys,json
courses = json.load(sys.stdin)
if courses:
    cid = courses[0]['id']
    print(f'Testing materials for course: {cid}')
"

# Then test the materials endpoint with a real course ID
curl -s "http://localhost:8000/api/courses/{COURSE_ID}/materials" \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python3 -m json.tool | head -30
```

---

## PHASE 3: Nexi Chat Pane — Wired to Real WebSocket

### What this does:
The center pane is the AI tutor conversation. It uses the EXISTING WebSocket at `/api/conversations/{id}/stream` with real Claude-powered Socratic dialogue.

### 3.1 NexiPane component

**File:** `apps/web/src/components/workspace/NexiPane.tsx`

This MUST include ALL of these features:

**From arena-thought (new):**
- Clean message rendering with bold/italic markdown parsing
- Citation tags on Nexi responses (from RAG source references)
- "Save to Notebook" button on each Nexi response
- "Copy" button on each Nexi response
- Follow-up suggestion chips: "Explain simply", "Quiz me", "Extract key ideas", "Compare concepts"
- Typing indicator (3 animated dots) while streaming
- Source grounding label in header: "Grounded in: [source name]"
- Max-width message container (`max-w-[640px] mx-auto`)
- Serif font for headings, sans for body text

**From Mastery (keep — CRITICAL):**
- Real WebSocket connection via `useArenaSocket` hook (NOT simulated responses)
- Token streaming (`assistant_token` → accumulate → `assistant_complete`)
- `session_start` with optional `quiz_result` payload
- `outline_update` handling → updates course progress
- `scaffold_update` handling → updates teaching mode
- `inline_visual` and `topic_visual` handling → Mermaid diagrams and tables
- Mermaid diagram rendering (using the existing `mermaid-diagram.tsx` component)
- Teaching mode display (assess/teach/check_understanding/challenge/apply/reflect)
- Voice mode toggle (real STT/TTS via existing voice endpoints)
- Response timeout handling (60-second timeout)
- Message dedup and streaming state management
- Score calculation based on topics covered / total outline

**The header bar must show:**
- Course title (left)
- Current module/topic being taught
- Source grounding label if a source is selected
- "Nexi" badge (right) with sparkle icon
- Teaching mode pill (current phase)
- Score percentage
- Voice toggle button

**The input area must have:**
- Auto-resizing textarea
- Voice input button (real Deepgram STT, not fake)
- Send button
- "Grounded in your course materials" disclaimer

### 3.2 Preserve the useArenaSocket hook

**File:** `apps/web/src/hooks/useArenaSocket.ts`

Keep the EXISTING hook. Do NOT rewrite it. It handles:
- WebSocket connection with auth token
- `session_start` / `user_message` sending
- Token streaming accumulation
- Outline, scaffold, visual message handling
- Reconnection and dedup logic

If you need to add features (like passing selected source context), extend the hook — don't replace it.

### 3.3 Preserve voice mode

**Files:** `apps/web/src/hooks/useVoice.ts`, voice-related code in session page

Keep the real voice pipeline:
- MediaRecorder → WebM blob → `/api/voice/stt` → transcript
- Nexi response → `/api/voice/tts` → audio playback
- VAD silence detection
- Auto-read toggle

### 3.4 Preserve Mermaid diagrams

**File:** `apps/web/src/components/ui/mermaid-diagram.tsx`

Keep the existing component with its sanitization and dynamic import. Render visuals inline in the chat.

### 3.5 Preserve placement quiz flow

The session page must still support:
1. Create conversation via `POST /api/conversations` with `course_id`
2. Check for placement quiz via `GET /api/courses/{id}/quiz`
3. If quiz exists, show quiz UI before connecting WebSocket
4. Submit quiz → connect WebSocket with `quiz_result`
5. If no quiz, connect WebSocket directly

### VERIFY Phase 3:
```bash
# Start servers
cd services/api && uvicorn app.main:app --port 8000 --reload &
cd apps/web && npm run dev &
sleep 10

# Create a conversation and test WebSocket connectivity
COURSE_ID=$(curl -s http://localhost:8000/api/courses/me/enrolled \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python3 -c "import sys,json; cs=json.load(sys.stdin); print(cs[0]['id'] if cs else '')")

if [ -n "$COURSE_ID" ]; then
  CONV_ID=$(curl -s -X POST http://localhost:8000/api/conversations \
    -H "Authorization: Bearer dev:auth0|learner-maria" \
    -H "Content-Type: application/json" \
    -d "{\"course_id\":\"$COURSE_ID\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  echo "Created conversation: $CONV_ID"
  echo "Open browser to: http://localhost:3000/session/$CONV_ID?course=$COURSE_ID"
fi
```

**Then manually verify in browser:**
- [ ] Nexi greets you (not blank screen)
- [ ] Messages stream token-by-token
- [ ] Follow-up chips appear after Nexi responds
- [ ] "Save to Notebook" button appears on Nexi messages
- [ ] "Copy" button works
- [ ] Mermaid diagrams render (if Nexi includes one)
- [ ] Teaching mode shows in header
- [ ] Score shows and updates
- [ ] Voice toggle works (enable → speak → hear response)

---

## PHASE 4: Notebook Pane — New Feature (Backend + Frontend)

### What this does:
A right-side panel where learners save insights from Nexi responses and capture personal notes. Also includes a vocabulary builder with AI-generated definitions.

### 4.1 Backend: Notebook endpoints

**File:** Create `services/api/app/routers/notebook.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from uuid import UUID, uuid4
from datetime import datetime
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User

router = APIRouter(prefix="/api/notebook", tags=["notebook"])

# ---------- Pydantic Models ----------
class NoteCreate(BaseModel):
    title: str
    content: str
    course_id: str | None = None
    tags: list[str] = []
    source: str = "personal"  # "nexi" | "personal" | "source"
    source_message_id: str | None = None

class NoteResponse(BaseModel):
    id: str
    title: str
    content: str
    course_id: str | None
    tags: list[str]
    source: str
    created_at: str

class VocabCreate(BaseModel):
    term: str
    definition: str
    example: str | None = None
    course_id: str | None = None
    tags: list[str] = []

class VocabResponse(BaseModel):
    id: str
    term: str
    definition: str
    example: str | None
    course_id: str | None
    tags: list[str]
    created_at: str

class GenerateDefinitionRequest(BaseModel):
    term: str
    course_context: str | None = None

# ---------- Notes CRUD ----------
@router.get("/notes")
async def list_notes(course_id: str | None = None, ...):
    """List all notes for current user, optionally filtered by course."""
    ...

@router.post("/notes", status_code=201)
async def create_note(note: NoteCreate, ...):
    """Create a new notebook entry."""
    ...

@router.delete("/notes/{note_id}")
async def delete_note(note_id: UUID, ...):
    """Delete a notebook entry."""
    ...

# ---------- Vocabulary CRUD ----------
@router.get("/vocab")
async def list_vocab(course_id: str | None = None, ...):
    """List all vocabulary terms for current user."""
    ...

@router.post("/vocab", status_code=201)
async def create_vocab(vocab: VocabCreate, ...):
    """Create a new vocabulary entry."""
    ...

@router.delete("/vocab/{vocab_id}")
async def delete_vocab(vocab_id: UUID, ...):
    """Delete a vocabulary entry."""
    ...

# ---------- AI-Generated Definitions ----------
@router.post("/vocab/generate-definition")
async def generate_definition(req: GenerateDefinitionRequest, ...):
    """Use Claude to generate a definition for a term in context of the course."""
    ...

@router.post("/vocab/generate-example")
async def generate_example(req: GenerateDefinitionRequest, ...):
    """Use Claude to generate a usage example for a term."""
    ...
```

### 4.2 Backend: Database models for Notebook

**File:** Add to `services/api/app/models/` (in the appropriate file)

```python
class NotebookEntry(Base):
    __tablename__ = "notebook_entries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(JSONB, default=[])
    source = Column(String, default="personal")  # nexi, personal, source
    source_message_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class VocabularyEntry(Base):
    __tablename__ = "vocabulary_entries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True)
    term = Column(String, nullable=False)
    definition = Column(Text, nullable=False)
    example = Column(Text, nullable=True)
    tags = Column(JSONB, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

Generate migration:
```bash
cd services/api && alembic revision --autogenerate -m "add_notebook_and_vocab_tables"
alembic upgrade head
```

### 4.3 Register notebook router

**File:** `services/api/app/main.py`

```python
from app.routers import notebook
app.include_router(notebook.router)
```

### 4.4 Frontend: NotebookPane component

**File:** `apps/web/src/components/workspace/NotebookPane.tsx`

Follow arena-thought's design, wired to real backend:
- **Mini mode**: Icon rail with notebook icon + entry count badge
- **Expanded mode**: Two tabs — "Notes" and "Vocab"
- **Notes tab**: Quick capture input + list of saved notes from `/api/notebook/notes`
- **Vocab tab**: Term list from `/api/notebook/vocab` + "Add term" form with AI-generate buttons
- "Save to Notebook" from NexiPane calls `POST /api/notebook/notes`
- "Generate definition" calls `POST /api/notebook/vocab/generate-definition`
- "Generate example" calls `POST /api/notebook/vocab/generate-example`
- Delete buttons on each entry

### 4.5 Frontend: API client methods

**File:** `apps/web/src/lib/api-client.ts`

Add methods:
```typescript
// Notebook
async listNotes(courseId?: string) { ... }
async createNote(note: NoteCreate) { ... }
async deleteNote(noteId: string) { ... }

// Vocabulary
async listVocab(courseId?: string) { ... }
async createVocab(vocab: VocabCreate) { ... }
async deleteVocab(vocabId: string) { ... }
async generateDefinition(term: string, courseContext?: string) { ... }
async generateExample(term: string, courseContext?: string) { ... }
```

### VERIFY Phase 4:
```bash
# Test notebook endpoints
curl -s -X POST http://localhost:8000/api/notebook/notes \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test note","content":"This is a test note","tags":["test"]}' | python3 -m json.tool

curl -s http://localhost:8000/api/notebook/notes \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python3 -m json.tool

# Test vocab endpoints
curl -s -X POST http://localhost:8000/api/notebook/vocab \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"term":"Backpropagation","definition":"Algorithm for training neural networks by computing gradients"}' | python3 -m json.tool

curl -s http://localhost:8000/api/notebook/vocab \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python3 -m json.tool

# Test AI definition generation
curl -s -X POST http://localhost:8000/api/notebook/vocab/generate-definition \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d '{"term":"gradient descent","course_context":"machine learning"}' | python3 -m json.tool
```

**Browser verification:**
- [ ] Notebook pane expands/collapses smoothly
- [ ] "Save to Notebook" on Nexi message creates a note
- [ ] Notes appear in the list immediately
- [ ] Quick capture input works
- [ ] Vocab tab shows terms
- [ ] "Generate" button produces a definition via Claude
- [ ] Delete buttons work
- [ ] Notes persist across page refreshes (stored in DB)

---

## PHASE 5: Standalone Pages

### 5.1 Dashboard/Home page (`/`)

**File:** `apps/web/src/app/page.tsx`

Follow arena-thought's Index.tsx design but wire to real data:
- Greeting: "Good morning/afternoon/evening, {name}" from `/api/auth/me`
- "Continue Learning" card: most recent session from `/api/conversations` with course title + progress
- "Recent Workspaces": last 3 sessions with course titles and progress
- "Upcoming Tasks": from study plan (if backend exists) or from session-derived suggestions
- Quick action buttons: "Open Library", "Review Notebook", "Study Plan"

### 5.2 Library/Courses page (`/courses`)

**File:** `apps/web/src/app/courses/page.tsx`

Keep the existing functionality (My Courses + Explore Courses) but adopt arena-thought's cleaner design:
- Serif font for course titles
- Progress bar on each card
- Last accessed time
- Pin functionality (store in localStorage for now)
- Filter tabs: All, Active, Completed
- Search input
- "Start Learning" → creates conversation → navigates to `/session/{id}`
- "Enroll Now" → `POST /api/enrollments` → moves card to My Courses

### 5.3 Analytics/Progress page (`/analytics`)

**File:** `apps/web/src/app/analytics/page.tsx`

Wire to `/api/mastery/analytics/me`:
- Overall stats: total sessions, messages, courses enrolled, streak
- Growth chart (sessions over time)
- Per-course breakdown: sessions completed, topics covered, current mode, mastery status
- Learner insights

### 5.4 Profile page (`/profile`)

Wire to `/api/auth/me` + `/api/mastery/me/profile`:
- Display name, email, role
- Mastery profile: thinking patterns, knowledge graph, pacing preferences
- Course progress overview

### 5.5 Sessions list page (`/sessions`)

Wire to `GET /api/conversations`:
- List all past sessions grouped by course
- Show message count, last message preview, date
- Click to resume → navigates to `/session/{id}`

### 5.6 Journal/Reflections page (`/journal`)

Wire to `/api/notebook/notes` filtered by source="personal":
- Standalone full-page view of personal notes
- Create/edit/delete
- Filter by course
- Tag management

### VERIFY Phase 5:
```bash
# Test each page loads
for path in "/" "/courses" "/analytics" "/profile" "/sessions" "/journal"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$path")
  echo "$path: HTTP $STATUS"
done
# All should be 200
```

**Browser verification:**
- [ ] Dashboard shows greeting with user's name
- [ ] Dashboard shows "Continue Learning" with real course data
- [ ] Courses page shows enrolled + available courses
- [ ] Enroll button works (course moves to "My Courses")
- [ ] "Start Learning" creates session and navigates to workspace
- [ ] Analytics shows real data from backend
- [ ] Profile shows user info
- [ ] Sessions list shows past conversations
- [ ] Journal shows personal notes

---

## PHASE 6: Design System Upgrade

### 6.1 Typography

Update `apps/web/tailwind.config.ts` to add serif font:
```typescript
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
  display: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
},
```

### 6.2 Custom utility classes

Add to `apps/web/src/app/globals.css`:
```css
/* Arena-thought design system */
.shadow-soft {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
}
.shadow-lifted {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
}
.card-interactive {
  @apply rounded-xl border border-border bg-card transition-all duration-250;
}
.card-interactive:hover {
  @apply border-primary/20 shadow-lifted;
}
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.15);
  border-radius: 2px;
}

/* Animations */
@keyframes fade-in-fast {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-fast {
  animation: fade-in-fast 200ms ease-out both;
}
```

### 6.3 Apply typography throughout

- Page headings: `font-serif text-4xl` (arena-thought style)
- Body text: `font-sans text-[13.5px] leading-relaxed`
- Labels/metadata: `font-sans text-[11px] tracking-[-0.01em]`
- Section headers: `font-sans text-[10px] uppercase tracking-widest text-muted-foreground`

### VERIFY Phase 6:
- [ ] Serif fonts render on headings
- [ ] Custom shadows apply on cards
- [ ] Scrollbars are thin in panes
- [ ] Animations play on page load

---

## PHASE 7: Follow-up Chips & Citations

### 7.1 Follow-up suggestion chips

After each Nexi response (when not streaming), show 4 contextual follow-up buttons:
```typescript
const followUpChips = [
  { label: "Explain simply", icon: Lightbulb },
  { label: "Quiz me", icon: HelpCircle },
  { label: "Extract key ideas", icon: ListChecks },
  { label: "Compare concepts", icon: ArrowRightLeft },
];
```

When clicked, send the label as a `user_message` through the WebSocket. Nexi will respond normally.

### 7.2 Citations on responses

When Nexi's response includes RAG-grounded content, the backend already sends source chunk references. Display them as small tags below the response:
```tsx
{msg.citations && msg.citations.length > 0 && (
  <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-border/60">
    {msg.citations.map((cite, i) => (
      <span key={i} className="text-[10px] font-sans text-muted-foreground/70 bg-muted/50 px-2 py-0.5 rounded-full flex items-center gap-1">
        <FileText className="h-2.5 w-2.5" />
        {cite}
      </span>
    ))}
  </div>
)}
```

Check if the backend already sends citation data in `assistant_complete` messages. If not, modify the Nexi engine to include source chunk filenames in the response metadata.

### VERIFY Phase 7:
- [ ] Follow-up chips appear after Nexi responds
- [ ] Clicking a chip sends it as a message
- [ ] Nexi responds to chip messages naturally
- [ ] Citations appear on RAG-grounded responses (if course has uploaded content)

---

## PHASE 8: Vocab Selection Popover (New Feature)

### What this does:
When learner selects text in Nexi's response, a small popover appears offering to save the selection as a vocabulary term.

### 8.1 VocabSelectionPopover component

**File:** `apps/web/src/components/workspace/VocabSelectionPopover.tsx`

Follow arena-thought's pattern:
- Listen for `mouseup` / `selectionchange` events on the chat container
- If text is selected, show a floating popover near the selection
- Popover has: "Save as vocab term" button
- Clicking it opens the vocab form in the NotebookPane with the term pre-filled
- Auto-generate definition using the AI endpoint

### VERIFY Phase 8:
- [ ] Select text in a Nexi response
- [ ] Popover appears near the selection
- [ ] "Save as vocab term" pre-fills the term in Notebook's vocab tab
- [ ] Definition auto-generates

---

## PHASE 9: Comprehensive Integration Testing

### 9.1 TypeScript compilation
```bash
cd apps/web && npx tsc --noEmit && echo "web: PASS" || echo "web: FAIL"
cd apps/admin && npx tsc --noEmit && echo "admin: PASS" || echo "admin: FAIL"
```

### 9.2 Python syntax validation
```bash
cd services/api && python3 -c "
import ast, glob
files = glob.glob('app/**/*.py', recursive=True)
ok = 0
for f in files:
    try: ast.parse(open(f).read()); ok += 1
    except SyntaxError as e: print(f'FAIL: {f}: {e}')
print(f'{ok}/{len(files)} Python files OK')
"
```

### 9.3 Database migration
```bash
cd services/api && alembic upgrade head && echo "Migration: PASS"
```

### 9.4 API endpoint smoke tests
```bash
TOKEN="dev:auth0|learner-maria"
ADMIN_TOKEN="dev:auth0|admin-james"
BASE="http://localhost:8000"

echo "=== API SMOKE TESTS ==="

# Auth
curl -sf "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "PASS: GET /auth/me" || echo "FAIL: GET /auth/me"

# Courses
curl -sf "$BASE/api/courses/me/enrolled" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "PASS: GET /courses/me/enrolled" || echo "FAIL"
curl -sf "$BASE/api/courses/me/available" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "PASS: GET /courses/me/available" || echo "FAIL"

# Conversations
curl -sf "$BASE/api/conversations" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "PASS: GET /conversations" || echo "FAIL"

# Mastery
curl -sf "$BASE/api/mastery/analytics/me" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "PASS: GET /mastery/analytics/me" || echo "FAIL"

# Notebook (new)
curl -sf "$BASE/api/notebook/notes" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "PASS: GET /notebook/notes" || echo "FAIL"
curl -sf "$BASE/api/notebook/vocab" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "PASS: GET /notebook/vocab" || echo "FAIL"

# Admin (must still work)
curl -sf "$BASE/api/admin/analytics/overview" -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null && echo "PASS: GET /admin/analytics" || echo "FAIL"

# Health
curl -sf "$BASE/health" > /dev/null && echo "PASS: GET /health" || echo "FAIL"

echo "=== DONE ==="
```

### 9.5 Full E2E flow test

**Test 1: New learner flow**
1. Browse courses at `/courses`
2. Enroll in a course ("Enroll Now" button)
3. Start learning → creates conversation → lands in workspace
4. Nexi greets you (verify message appears)
5. Send a message → Nexi responds with streaming tokens
6. Click "Save to Notebook" on a response → verify it saves
7. Click "Explain simply" chip → Nexi responds
8. Expand Sources pane → verify course materials load
9. Expand Notebook pane → verify saved note appears
10. Toggle voice → speak → hear response
11. Navigate to `/analytics` → verify session shows
12. Navigate to `/` → verify "Continue Learning" shows the course

**Test 2: Resume session flow**
1. Navigate away from workspace
2. Come back to the same session URL
3. Previous messages should load
4. Sidebar should show course topics (not generic phases)
5. Score should reflect progress
6. Sending a new message should work

**Test 3: Admin app still works**
1. Open `http://localhost:3001` (admin app)
2. Login as admin
3. Courses page loads with existing courses
4. Analytics page loads with data
5. Learners page loads
6. Create a new course → verify it appears on learner's `/courses` page

### 9.6 Cross-feature interaction tests

```
[ ] Save Nexi response to notebook → appears in Notebook pane AND /journal page
[ ] Select text in Nexi response → vocab popover → save term → appears in Notebook vocab tab
[ ] Click source in Sources pane → Nexi header shows "Grounded in: X" → send message → response references that source
[ ] Complete multiple topics → score increases → analytics reflects progress
[ ] Voice mode: enable → speak → Nexi responds with audio → text also shows in chat
[ ] Mermaid diagram in response → renders correctly → "Save to Notebook" saves the text (not the diagram SVG)
[ ] Follow-up chip "Quiz me" → Nexi asks a quiz question → answer it → Nexi evaluates
[ ] Teaching mode changes (assess → teach) → header updates → scaffold changes
[ ] Placement quiz → skip to challenge mode → Nexi starts at harder level
```

### VERIFY Phase 9:
ALL of the above must pass. Do NOT mark as done until every single check passes. If ANY fails, fix it and re-test.

---

## PHASE 10: Final Polish & Commit

### 10.1 Remove all console.log/debug statements
```bash
cd apps/web && grep -rn "console\.log" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v "// keep"
# Remove any that aren't wrapped in isDev checks
```

### 10.2 Ensure no TypeScript errors
```bash
cd apps/web && npx tsc --noEmit
cd apps/admin && npx tsc --noEmit
```

### 10.3 Ensure no ESLint errors
```bash
cd apps/web && npx eslint src/ --ext .ts,.tsx --quiet 2>&1 | tail -5
```

### 10.4 Build check
```bash
cd apps/web && npm run build 2>&1 | tail -10
cd apps/admin && npm run build 2>&1 | tail -10
```

### 10.5 Commit

```bash
git add -A
git status  # Review what's being committed
git commit -m "feat: Arena-Akash — 3-pane workspace UI with Sources, Notebook, and refreshed design

- Replace learner frontend with arena-thought-inspired 3-pane workspace layout
- Sources pane: browse course materials by topic, inline document viewer
- Notebook pane: save Nexi responses, quick capture notes, vocabulary builder with AI definitions
- NexiPane: follow-up chips, citations, copy/save buttons, clean message rendering
- Vocab selection popover: select text → save as term
- New backend endpoints: /api/notebook/notes, /api/notebook/vocab, /api/courses/{id}/materials
- New database models: NotebookEntry, VocabularyEntry
- Design system: serif headings, shadow-soft/lifted, micro-animations, thin scrollbars
- Standalone pages: Dashboard, Library, Analytics, Profile, Sessions, Journal
- ALL existing features preserved: WebSocket streaming, adaptive teaching, voice mode,
  Mermaid diagrams, placement quiz, score tracking, course outline, teaching modes
- Admin app (port 3001) completely untouched

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## FEATURE MAPPING — Arena-Thought vs Mastery (NOTHING MISSED)

| Feature | Arena-Thought | Mastery | Arena-Akash |
|---------|:---:|:---:|:---:|
| 3-pane resizable workspace | Yes | No | **YES** |
| Sources pane (course materials viewer) | Yes (mock) | No | **YES (real data)** |
| Notebook (save responses + notes) | Yes (mock) | No | **YES (real DB)** |
| Vocabulary builder | Yes (mock) | No | **YES (real DB + AI)** |
| Text selection → vocab popover | Yes (mock) | No | **YES (real)** |
| Follow-up suggestion chips | Yes | No | **YES** |
| Citations on responses | Yes (mock) | No (has RAG) | **YES (real RAG)** |
| Copy response button | Yes | No | **YES** |
| Message markdown rendering | Yes | Partial | **YES** |
| Serif typography / design system | Yes | No | **YES** |
| Micro-animations | Yes | Partial | **YES** |
| Thin scrollbars | Yes | No | **YES** |
| Real AI (Claude) | No (mock) | Yes | **YES** |
| WebSocket streaming | No | Yes | **YES** |
| Adaptive teaching modes | No | Yes | **YES** |
| Placement quiz | No | Yes | **YES** |
| Mermaid diagrams | No | Yes | **YES** |
| Voice mode (real STT/TTS) | No (fake) | Yes | **YES** |
| Score/progress tracking | No | Yes | **YES** |
| Course outline sidebar | No | Yes | **YES (in Sources pane)** |
| Teaching mode display | No | Yes | **YES** |
| Course enrollment | No | Yes | **YES** |
| Admin dashboard | No | Yes | **YES (untouched)** |
| Course creation/ingestion | No | Yes | **YES (untouched)** |
| Multi-tenant / org isolation | No | Yes | **YES** |
| Analytics dashboard | No | Yes | **YES** |
| User authentication (Auth0) | No | Yes | **YES** |
| Session history / resume | No | Yes | **YES** |

**Total features in Arena-Akash: 28 (13 from arena-thought + 15 from Mastery)**

---

## WHEN YOU'RE DONE

Reply with:
> "Arena-Akash complete. All 10 phases verified. [X] new files created, [Y] files modified, [Z] tests passing. Every feature from both codebases is working."

If ANY verification fails, report exactly which one and fix it before declaring done.

DO NOT skip any phase. DO NOT skip any verification. DO NOT mark as done without RUNNING and SEEING every feature work.
