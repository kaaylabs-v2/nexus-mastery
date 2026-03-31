# Mastery (Nexus²) — Session Handoff Context
**Date**: 2026-03-24

## What Is This Project?
Mastery (Nexus²) is an AI-powered adaptive learning platform. Monorepo structure:
- `apps/web` — Next.js learner app (port 3000)
- `apps/admin` — Next.js admin app (port 3001)
- `services/api` — FastAPI backend (port 8000)
- `infra/docker-compose.yml` — Postgres (pgvector) + Redis

## What Was Just Completed

### 1. Adaptive Mode Progression (THE BIG FEATURE)
Sessions no longer use fixed exchange counts to transition between modes. Instead:

**Flow**: `assess → teach → check_understanding → challenge → apply → reflect`

**How it works**:
- **Assess phase** (NEW): Nexi opens by asking casual questions to gauge what the learner already knows. A Haiku-based evaluator determines `familiarity` (none/basic/intermediate/advanced) and `teach_depth` (foundational/intermediate/advanced), then decides which mode to skip to.
- **Per-exchange evaluation**: After every learner response, a lightweight Haiku call (~300ms) evaluates `comprehension`, `reasoning_quality`, `engagement` and makes a `decision` (advance/stay/retreat). Also generates a `learner_insight` string.
- **Guardrails**: MAX_EXCHANGES_PER_MODE=5 (force advance), MIN_EXCHANGES_PER_MODE=1, force reflect after 15+ total exchanges.
- **Teach depth calibration**: The assess result sets a teach_depth that modifies Nexi's system prompt for the rest of the session (foundational = simple language; advanced = edge cases).
- **Learner insights pipeline**: Per-exchange insights accumulate and feed into the end-of-session `assess_session()` call, updating the user-level mastery profile.

**Files created/modified (backend)**:
- `services/api/app/services/response_evaluator.py` — **NEW**. Contains `assess_learner_level()` and `evaluate_response()`. Uses Haiku. Has `_apply_guardrails()` and `_parse_json()` helper.
- `services/api/app/models/conversation.py` — Added `assess = "assess"` to `SessionMode` enum, changed default from "teach" to "assess".
- `services/api/app/services/nexi_engine.py` — Added SESSION MODES section to system prompt with assess mode. Added teach_depth calibration in `_build_messages()`. Updated first message logic for assess mode.
- `services/api/app/routers/conversations.py` — Major rewrite of WebSocket handler. Added `_get_adaptive_mode()`, `_count_exchanges_in_mode()`. Evaluation + topic detection run in parallel via `asyncio.gather`. Scaffold_update now includes `next_mode` and `evaluation` data. Session completion collects `learner_insights`. Conversation creation defaults to `session_mode="assess"`.
- `services/api/app/services/session_assessment.py` — Added `learner_insights: list[str] | None = None` parameter. Insights are injected into the assessment prompt context.

**Files modified (frontend)**:
- `apps/web/src/hooks/useArenaSocket.ts` — Added `EvaluationResult` interface, `ScaffoldUpdate` now has `next_mode` and `evaluation` fields, initial `currentMode` is `"assess"`, added `lastEvaluation` state, scaffold_update handler uses `data.next_mode || data.mode`.
- `apps/web/src/app/session/[id]/page.tsx` — `StageKey` type now includes `"assess"`, stages array has `{ key: "assess", label: "Getting Started" }` first, `stageColors` has assess entry (`hsl(280 50% 55%)`), `stageInsights` has assess entry, `activeStage` fallback is `"assess"`, destructures `lastEvaluation` from hook.

### 2. Learner App UI Overhaul (COMPLETED)
- Primary color: teal → warm indigo-violet (`250 55% 58%`)
- Background: warmer cream (`30 30% 98%`)
- Border radius: `0.75rem` → `1rem` (cards `rounded-2xl`)
- Nexi messages: DM Sans font at 15px/1.75 line-height
- All pages updated: dashboard, session, courses, analytics, journal, profile
- Sidebar, global context bar, insight banner, mastery card all updated
- `apps/web/src/app/globals.css` fully rewritten

### 3. Session Dedup Fix (COMPLETED)
- Dashboard "Hop Back In" filters `messages.length > 1`, groups by `course_id`, shows max 3

## What Is NOT Done

### 1. Live End-to-End Testing — CRITICAL
The adaptive progression has NOT been tested with real sessions. The user's spec explicitly requires:
> "Test this by running actual sessions where the learner gives (1) brilliant answers and verifies the mode advances faster, and (2) confused answers and verifies the mode drops back. Show proof."

To test:
1. Start Docker: `docker compose -f infra/docker-compose.yml up -d`
2. Start API: `cd services/api && uvicorn app.main:app --reload --port 8000`
3. Start web: `cd apps/web && pnpm dev`
4. Create a course in admin, then start a session as a learner
5. Test assess phase with "I know nothing about this" → should stay in teach/foundational
6. Test assess phase with expert-level response → should skip ahead to challenge/advanced
7. Test mid-session: give confused answers → mode should retreat; give brilliant answers → mode should advance

### 2. Alembic Migration
The `SessionMode` enum in the DB needs an Alembic migration to add `"assess"` and change the default. Without this, new conversations will fail if the DB enforces the enum.

### 3. Voice Component Investigation
Voice (ElevenLabs TTS + Deepgram STT) wasn't working when opening a session. Added `console.error("[TTS] Voice playback failed:", err)` for debugging. Most likely causes: backend not running (confirmed — API was down), or browser autoplay policy.

### 4. Playwright E2E Tests
Per project rules (`CLAUDE.md`), every frontend feature needs Playwright tests. None written yet for the adaptive progression or the UI overhaul.

## Key Architecture Notes

### Adaptive Evaluation Flow (per exchange)
```
User sends message
  → WebSocket handler receives it
  → Nexi streams response back
  → After streaming completes, in parallel:
      1. evaluate_response() or assess_learner_level() via Haiku
      2. _detect_topic_transition() for course outline progress
  → scaffold_update sent to frontend with evaluation + next_mode
  → Assistant message persisted with _next_mode, _evaluation, _teach_depth metadata
  → Next exchange reads _next_mode from metadata to determine current mode
```

### Mode Progression Logic
```python
MODE_ORDER = ["assess", "teach", "check_understanding", "challenge", "apply", "reflect"]
# advance = move forward in MODE_ORDER
# stay = remain in current mode
# retreat = move backward in MODE_ORDER (never below "teach")
# Guardrails override AI decision if stuck too long
```

### Key Function Signatures
```python
# response_evaluator.py
async def assess_learner_level(learner_response: str, course_topic: str, mastery_profile: dict | None = None) -> dict
# Returns: familiarity, skip_to_mode, teach_depth, reason, learner_insight

async def evaluate_response(current_mode: str, nexi_message: str, learner_response: str, mastery_profile: dict | None = None, exchanges_in_current_mode: int = 1, total_exchanges: int = 1) -> dict
# Returns: comprehension, reasoning_quality, engagement, decision, reason, learner_insight, next_mode
```

## Environment
- `.env` at repo root has `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`
- Docker compose: `infra/docker-compose.yml` (Postgres pgvector:pg16 + Redis 7)
- Package manager: pnpm (monorepo with Turborepo)
- Python: 3.11+, FastAPI, Anthropic SDK
- Frontend: Next.js 16, React 19, Tailwind, Framer Motion, ReactMarkdown

## Project Rules (from CLAUDE.md)
1. **Plan mode** for any 3+ step task
2. **Use subagents** liberally for parallel work
3. **Update `tasks/lessons.md`** after any correction from the user
4. **NEVER mark done without running it** — "I wrote the code" is not done
5. **Every frontend feature needs Playwright tests** before it's considered done
6. **Simplicity first** — minimal impact changes, find root causes

## Slack
- Progress update was sent to Krishnan (CEO, user_id: U0H3NR81J) on 2026-03-24
- The user (Santosh) is on the Kaay Labs team

## Immediate Next Steps (Priority Order)
1. Get Docker services running and start the API
2. Run Alembic migration for `assess` enum value
3. Test adaptive progression end-to-end with real sessions (brilliant vs confused learner)
4. Write Playwright tests for the adaptive flow
5. Investigate voice component if it still doesn't work once backend is up
