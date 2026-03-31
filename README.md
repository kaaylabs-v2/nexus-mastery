# Nexus² — Adaptive Mastery Learning Platform

An AI-powered learning platform where learners develop real skills through personalized, Socratic conversations with **Nexi**, an AI tutor that adapts to how each person learns.

Unlike traditional e-learning (watch video → take quiz), Nexus² teaches through **conversation**. Nexi follows a structured course outline, teaches concepts with real examples from the uploaded material, checks understanding, adjusts depth based on the learner's responses, and tracks progress through topics — not just time spent.

---

## What It Does

### For Learners
- **Conversational learning sessions** with Nexi, an AI tutor powered by Claude (Anthropic)
- **Adaptive teaching** — Nexi assesses what you already know, then calibrates depth (beginner → expert)
- **Course outline tracking** — see which topics you've covered, what's next, and your overall progress
- **Visual aids** — Mermaid diagrams, charts, and comparison tables appear inline during teaching
- **Voice mode** — Nexi reads responses aloud via ElevenLabs TTS; Deepgram STT for voice input
- **Thinking scaffold** — side panel for note-taking with structured prompts (assumptions, evidence, alternatives)
- **Placement quizzes** — optional pre-session assessment to skip content you already know

### For Admins
- **Upload any document** (PDF, DOCX, PPTX, TXT) → AI generates a complete course with teaching outline, mastery criteria, scenarios, and visual aids
- **Or describe what you want to teach** → AI creates the course from a text prompt alone (no files needed)
- **DALL-E 3 thumbnails** — auto-generated course artwork based on content and category
- **Course publishing** with draft/active workflow
- **User management** — invite learners, bulk CSV import, role-based access
- **Analytics** — enrollment tracking, session activity, course performance

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│                                                                  │
│  ┌──────────────────┐          ┌──────────────────┐             │
│  │   Learner App    │          │   Admin Studio    │             │
│  │   Next.js 16     │          │   Next.js 16      │             │
│  │   Port 3000      │          │   Port 3001       │             │
│  │                  │          │                   │             │
│  │  - Session Arena │          │  - Course Upload   │             │
│  │  - Dashboard     │          │  - AI Generation   │             │
│  │  - Course Cards  │          │  - User Management │             │
│  │  - Voice Toggle  │          │  - Analytics       │             │
│  └────────┬─────────┘          └────────┬──────────┘             │
│           │ REST + WebSocket             │ REST                   │
└───────────┼──────────────────────────────┼───────────────────────┘
            │                              │
┌───────────▼──────────────────────────────▼───────────────────────┐
│                     FastAPI Backend (Port 8000)                   │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │   Routers   │  │   Services   │  │      Middleware          │ │
│  │             │  │              │  │                          │ │
│  │ /conversations│ │ nexi_engine  │  │  auth (JWT/dev tokens)  │ │
│  │ /courses    │  │ rag_pipeline │  │  tenant (org scoping)   │ │
│  │ /admin      │  │ course_gen   │  │                          │ │
│  │ /enrollments│  │ response_eval│  └─────────────────────────┘ │
│  │ /voice      │  │ quiz_gen     │                               │
│  │ /programs   │  │ session_assess│  ┌─────────────────────────┐ │
│  │ /mastery    │  │ voice_service│  │      Models (ORM)        │ │
│  │ /auth       │  │ thumbnail_svc│  │                          │ │
│  └─────────────┘  │ file_storage │  │  User, Course, Program   │ │
│                   └──────────────┘  │  Conversation, Enrollment│ │
│                                     │  MasteryProfile, Embedding│ │
│                                     │  IngestionJob, CourseFile │ │
│                                     └─────────────────────────┘ │
└──────────┬────────────────────┬──────────────────────────────────┘
           │                    │
    ┌──────▼──────┐      ┌──────▼──────┐
    │ PostgreSQL  │      │    Redis    │
    │ 16 + pgvector│     │      7      │
    │             │      │             │
    │ - All data  │      │ - Caching   │
    │ - Embeddings│      │             │
    │   (1536-dim)│      │             │
    └─────────────┘      └─────────────┘

External APIs:
  - Anthropic Claude (Sonnet 4 for generation, Haiku 4.5 for evaluation)
  - OpenAI (ada-002 embeddings, DALL-E 3 thumbnails)
  - ElevenLabs (text-to-speech)
  - Deepgram (speech-to-text)
```

---

## How a Session Works

```
Learner opens session
        │
        ▼
  ┌─────────────┐
  │  ASSESS     │  Nexi asks 1-2 questions to gauge existing knowledge
  │  (Haiku)    │  → determines teach depth (foundational/intermediate/advanced)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  TEACH      │  Nexi teaches from the course outline, topic by topic
  │  (Haiku)    │  → uses RAG to ground in uploaded material
  │             │  → sends visuals (diagrams, charts) inline
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  CHECK      │  Asks learner to explain back, give examples
  │             │  → evaluator decides: advance / stay / retreat
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  CHALLENGE  │  Edge cases, counterarguments, "what if" scenarios
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  APPLY      │  Realistic scenario the learner works through
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  REFLECT    │  Consolidate learning, connect to bigger picture
  └──────┬──────┘
         ▼
  Session Assessment (Sonnet) → updates mastery profile
  → insights carry to future sessions across all courses
```

**Adaptive progression**: After each exchange, a Haiku evaluator reads the learner's response and decides whether to advance, stay, or retreat. A fast learner might reach "Challenge" in 3 exchanges. A struggling learner stays in "Teach" with re-explanations. Guardrails prevent getting stuck (max 5 exchanges per mode, forced reflect after 15 total).

---

## Course Ingestion Pipeline

```
Admin uploads PDF/DOCX/PPTX
        │
        ▼
  Extract text (pypdf, python-docx, python-pptx)
        │
        ▼
  Claude Sonnet analyzes content
  → title, description, mastery criteria, topics, scenarios, domains, category
        │
        ▼
  Create Course + Program + Domains + Capabilities
        │
        ▼
  Chunk text → Embed with OpenAI ada-002 → Store in pgvector
  (RAG index for Nexi to retrieve during teaching)
        │
        ▼
  Claude Sonnet generates teaching outline (5-15 modules)
  with Mermaid diagrams, charts, and tables per topic
        │
        ▼
  DALL-E 3 generates course thumbnail on publish
        │
        ▼
  Course ready for learners
```

Alternatively, admins can **describe what they want to teach** in a text prompt — no file upload needed. The same pipeline runs, generating the full course from the description alone.

---

## Project Structure

```
nexus-mastery/
├── apps/
│   ├── web/                    # Learner app (Next.js 16, Turbopack)
│   │   ├── src/
│   │   │   ├── app/            # Pages: dashboard, courses, session, analytics, journal, profile
│   │   │   ├── components/     # UI: session arena, mermaid diagrams, charts, scaffold panel
│   │   │   ├── hooks/          # useArenaSocket (WebSocket), useVoice (STT)
│   │   │   ├── contexts/       # LearnerContext (mock data + state)
│   │   │   └── lib/            # API client, auth, store
│   │   └── e2e/                # Playwright tests (navigation, session, deep learning flow)
│   │
│   └── admin/                  # Admin studio (Next.js 16)
│       ├── src/
│       │   ├── app/            # Pages: dashboard, upload, courses, users, analytics, settings
│       │   └── lib/            # Admin API client
│       └── e2e/                # Playwright tests (lifecycle, cross-app flow)
│
├── services/
│   └── api/                    # FastAPI backend
│       ├── app/
│       │   ├── core/           # Config (Pydantic settings), database (async SQLAlchemy), security
│       │   ├── middleware/     # Auth (JWT + dev tokens), tenant (org scoping)
│       │   ├── models/         # SQLAlchemy ORM: User, Course, Conversation, Enrollment, etc.
│       │   ├── routers/        # API routes: conversations, courses, admin, enrollments, voice, etc.
│       │   ├── schemas/        # Pydantic request/response models
│       │   └── services/       # Business logic:
│       │       ├── nexi_engine.py        # Socratic AI tutor (system prompt, outline-aware teaching)
│       │       ├── response_evaluator.py # Adaptive mode progression (Haiku)
│       │       ├── course_generator.py   # AI course generation + outline with visuals
│       │       ├── rag_pipeline.py       # Text chunking, embedding, vector retrieval
│       │       ├── quiz_generator.py     # Placement quiz generation
│       │       ├── session_assessment.py # Post-session mastery evaluation
│       │       ├── voice_service.py      # ElevenLabs TTS + Deepgram STT
│       │       ├── thumbnail_service.py  # DALL-E 3 course thumbnails
│       │       └── file_storage.py       # File upload management
│       ├── tests/              # pytest unit tests
│       └── test_files/         # Sample content for E2E tests
│
├── infra/
│   └── docker-compose.yml      # PostgreSQL 16 + pgvector, Redis 7
│
├── packages/
│   └── shared-types/           # Shared TypeScript types
│
├── scripts/
│   └── run-e2e.sh              # E2E test runner (lifecycle, deep, admin, web, all)
│
└── tasks/                      # Planning docs and lessons learned
```

---

## Getting Started

### Prerequisites
- Node.js 20+, pnpm
- Python 3.12+
- Docker Desktop

### 1. Start infrastructure
```bash
cd infra && docker compose up -d
```

### 2. Start the API
```bash
cd services/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your API keys
uvicorn app.main:app --reload --port 8000
```

### 3. Start the apps
```bash
# From project root
pnpm install

# Learner app
cd apps/web && pnpm dev        # http://localhost:3000

# Admin studio
cd apps/admin && pnpm dev      # http://localhost:3001
```

### Environment Variables (`.env`)
```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_mastery
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=sk_...
DEEPGRAM_API_KEY=...
DEV_AUTH=true
```

---

## E2E Tests

```bash
# Full lifecycle: admin uploads → generates course → learner learns from it
./scripts/run-e2e.sh lifecycle

# Deep learning flow: multi-turn conversation with mode progression
./scripts/run-e2e.sh deep

# All tests (31 total)
./scripts/run-e2e.sh all
```

---

## Key Technical Decisions

| Decision | Why |
|---|---|
| **Claude Haiku for evaluation** | Fast (~300ms), cheap, only needs to answer "did they get it?" — runs every exchange |
| **Claude Sonnet for generation** | Complex tasks: course analysis, outline creation, session assessment |
| **RAG by topic, not user message** | When user says "Yes", retrieving by "Yes" returns garbage. Retrieving by the current topic title + concepts returns relevant material |
| **Separate DB sessions for RAG** | RAG SQL failures (vector cast errors) poisoned the main transaction. Isolated sessions prevent cascade failures |
| **WebSocket streaming** | Token-by-token delivery for real-time teaching feel. Messages persisted with `flag_modified()` for JSONB mutation detection |
| **CSS gradient thumbnails as fallback** | DALL-E 3 thumbnails are generated on publish, but gradient patterns render instantly while images load or if generation fails |
| **Assess phase before teaching** | 1-2 exchanges to gauge familiarity. Experts skip to Challenge. Beginners get foundational depth. Zero wasted time |

---

## License

Private — Kaaylabs
