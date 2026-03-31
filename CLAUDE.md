## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done — MANDATORY
- **NEVER mark a task complete without RUNNING IT and seeing it work**
- "I wrote the code" is not done. "I ran it and here's the output" is done.
- For API endpoints: make the actual HTTP request (curl/httpx) and show the response
- For pipelines: run the full pipeline end-to-end with real data — create a test file, upload it, process it, verify the output in the database
- For frontend changes: start the dev server, open the page, verify it renders correctly
- For bug fixes: reproduce the bug first, fix it, then show it no longer reproduces
- If something depends on external services (Claude API, OpenAI, Deepgram): test with real API calls, not mocks, unless the user says otherwise
- Show curl commands, responses, DB query results, screenshots — PROOF it works
- Ask yourself: "If the user tries this right now, will it work?" If you're not sure, TEST IT.
- Diff behavior between main and your changes when relevant

### 4b. Browser E2E Testing — MANDATORY FOR EVERY FEATURE
- **Every feature that touches the frontend MUST have a Playwright test BEFORE it's considered done**
- The test must open a real browser, navigate to the page, interact with the UI, and verify the result
- For features that span admin + learner apps: write a cross-app test that proves the full flow works (admin creates → learner sees → learner uses)
- **Build order for every feature**: Write code → Write Playwright test → Run test in headed mode → Fix what breaks → Run again → Only then mark done
- Playwright tests go in `apps/admin/e2e/` and `apps/web/e2e/`
- Every test takes screenshots at key steps saved to `test-results/screenshots/`
- Run with `npx playwright test --headed` so you can see the browser clicking through
- **Do NOT use `if (await btn.count() > 0)` fallbacks that silently skip steps** — if a button should be there and isn't, that's a FAILURE, not a branch to handle gracefully
- **Do NOT write tests that only pass because they catch errors silently**
- The user should NEVER be the one to discover a broken UI. The Playwright tests catch it first.

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
