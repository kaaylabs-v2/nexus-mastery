# Verification Prompt for All Recent Fixes

Paste this into Claude Code. It will verify every fix we applied.

---

## CRITICAL RULES BEFORE YOU START:
- Do NOT modify any code. This is a READ-ONLY verification task.
- Do NOT change auth tokens, API URLs, environment variables, or column types.
- Do NOT run `git stash`, `git checkout`, or any destructive git commands.
- DEV_AUTH=true must stay in .env. Tokens like `dev:auth0|admin-james` and `dev:auth0|learner-maria` are intentional — do not remove them.

## What to verify:

### 1. TypeScript builds clean
```bash
cd apps/web && npx tsc --noEmit
```
Expected: zero errors.

### 2. Python syntax is valid
```bash
cd services/api && python3 -c "
import ast
for f in ['app/routers/conversations.py', 'app/routers/admin.py', 'app/services/nexi_engine.py', 'app/services/response_evaluator.py']:
    ast.parse(open(f).read())
    print(f'OK: {f}')
"
```
Expected: all 4 files OK.

### 3. Next.js dev server starts
```bash
cd apps/web && npm run dev &
sleep 8
curl -s http://localhost:3000 | head -20
```
Expected: HTML response, no crash.

### 4. FastAPI server starts
```bash
cd services/api && uvicorn app.main:app --port 8000 &
sleep 5
curl -s http://localhost:8000/api/health
```
Expected: health check passes.

### 5. Admin reset endpoint exists and responds
```bash
curl -s -X DELETE http://localhost:8000/api/admin/reset-all-data \
  -H "Authorization: Bearer dev:auth0|admin-james" | python3 -m json.tool
```
Expected: JSON with `"status": "success"` and `"deleted"` counts.

### 6. Analytics overview no longer has duplicate categories
```bash
curl -s http://localhost:8000/api/admin/analytics/overview \
  -H "Authorization: Bearer dev:auth0|admin-james" | python3 -m json.tool
```
Expected: `top_categories` array has NO duplicate names. Each category name appears at most once.

### 7. Conversation session_start handles existing sessions gracefully
Check `services/api/app/routers/conversations.py`:
- Line near `if not conversation:` should send an error message back via websocket, NOT silently `continue`
- Line near `if conversation.messages:` should send `outline_update` and `scaffold_update` back, NOT silently `continue`
- The `_greeting_in_progress` set should be cleaned up in a `finally` block (search for `_greeting_in_progress.discard`)
- Verify the try/finally wraps the entire session_start block

### 8. Score calculation doesn't show phantom 17%
Check `apps/web/src/app/session/[id]/page.tsx`:
- Find `scorePercent` — the fallback when `courseOutline.length === 0` should be `0`, NOT `Math.round(((currentPhaseIndex + 1) / totalPhases) * 100)`

### 9. Client requests outline on session resume
Check `apps/web/src/hooks/useArenaSocket.ts`:
- In `ws.onopen`, when `hasGreetedRef.current` is already true (resumed session), it should still send `{ type: "session_start" }` to get outline/scaffold
- But it should NOT set `isStreaming(true)` or call `startResponseTimeout()` for resumed sessions

### 10. Top bar shows course topics, not generic phase labels
Check `apps/web/src/app/session/[id]/page.tsx`:
- The top bar (near `border-b border-border/60 bg-card`) should have a conditional:
  - If `courseOutline.length > 0`: render course topic pills from `courseOutline.map(section => ...)`
  - Else: fall back to `stages.map(stage => ...)` (the generic Learn/Understand/etc labels)

### 11. Mermaid diagram component is robust
Check `apps/web/src/components/ui/mermaid-diagram.tsx`:
- Mermaid should be lazy-loaded (dynamic `import("mermaid")`, NOT top-level `import mermaid from "mermaid"`)
- There should be a `sanitizeMermaidContent()` function that fixes: markdown fences, flowchart→graph, subgraph removal, special chars in labels
- Each render should use a unique ID (counter-based, not just random)
- Error state should show an actual message, not just blank white space

### 12. Nexi prompt does NOT accept passive "yes" responses
Check `services/api/app/services/nexi_engine.py` (the NEXI_SYSTEM_PROMPT):
- There should be NO instruction saying "When the learner says 'yes' or 'makes sense' — move forward"
- Instead there should be explicit instructions to PROBE when getting passive responses
- The "WHAT YOU NEVER DO" section should include a ban on "Make sense?" / "Does this click?" endings
- The TEACHING PATTERN step 3 should say "TEST" with a specific question, NOT "CHECK: Does this make sense?"
- SESSION MODES → CHECK UNDERSTANDING should say "This is NOT 'does this make sense?' — this is where the learner PROVES they understand"

### 13. Evaluator rejects passive responses
Check `services/api/app/services/response_evaluator.py`:
- `MIN_EXCHANGES_PER_MODE` should be 2 (not 1)
- `MAX_EXCHANGES_PER_MODE` should be 6 (not 5)
- The EVALUATOR_PROMPT should contain text about passive responses like "yes", "got it" NEVER triggering "advance"
- TEACH mode special case should say advance ONLY on substantive responses

### 14. Chat gap fix — messages stack from bottom
Check `apps/web/src/app/session/[id]/page.tsx`:
- The chat scrollable container should have `flex flex-col` class
- There should be a `<div className="flex-1" />` spacer before the messages
- Messages should be inside a `<div className="space-y-5">` wrapper

### 15. Voice fixes intact (from previous session)
Check `apps/web/src/lib/api-client.ts`:
- `textToSpeech()` method should have `await this.ensureToken()` at the start
Check `apps/web/src/app/session/[id]/page.tsx`:
- `getAutoReadPref()` should default to `false`, not `true`
- `sessionReadyRef` and `readMessagesRef` should exist to prevent auto-reading old messages on resume

### 16. End-to-end flow test (if servers are running)
```bash
# Create a course
COURSE=$(curl -s -X POST http://localhost:8000/api/admin/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Course","description":"Testing"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Course: $COURSE"

# Create a conversation for the learner
CONV=$(curl -s -X POST http://localhost:8000/api/conversations \
  -H "Authorization: Bearer dev:auth0|learner-maria" \
  -H "Content-Type: application/json" \
  -d "{\"course_id\":\"$COURSE\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Conversation: $CONV"

# Verify conversation was created with proper defaults
curl -s http://localhost:8000/api/conversations/$CONV \
  -H "Authorization: Bearer dev:auth0|learner-maria" | python3 -m json.tool
```
Expected: conversation has `session_mode: "assess"`, `topics_covered: []`, `current_topic_id: 1`

## Summary
If ALL 16 checks pass, reply with: "All verifications passed. The fixes are solid."
If ANY check fails, list exactly which ones failed and what the actual vs expected values were. Do NOT attempt to fix anything — just report.
