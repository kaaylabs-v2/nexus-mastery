# Lessons Learned — Nexus² Mastery Platform

## Lesson 1: "Comprehensive" means tested, not written
**Date**: 2026-03-19
**Mistake**: Every prompt was described as "comprehensive" but only contained code specs — no verification that the code actually worked. Features were marked as done based on code review, not actual testing. The user found broken enrollment (`[object Object]`), broken program pages ("0 programs"), duplicate Nexi responses, and auth crashes — all of which should have been caught before reaching the user.
**Rule**: Never call a prompt "comprehensive" unless it includes actual test execution (Playwright for frontend, curl for API) with explicit pass/fail criteria. "Comprehensive" = builds it + tests it + proves it works + catches its own bugs.

## Lesson 2: Frontend features require browser testing, not just API testing
**Date**: 2026-03-19
**Mistake**: All verification was API-level (curl commands). Frontend bugs like `[object Object]` alerts, "0 programs" display, and duplicate responses can only be caught by actually opening the app in a browser. Curl can't catch a broken UI.
**Rule**: Every feature that touches the frontend must have a Playwright test that opens a real browser, clicks through the flow, and takes screenshots. This is mandatory, not optional. Build order: write code → write Playwright test → run test → fix breaks → repeat.

## Lesson 3: Cross-app flows must be tested as one continuous flow
**Date**: 2026-03-19
**Mistake**: Admin Studio and Arena were tested independently. Nobody tested the full chain: admin uploads content → course created → learner sees it → enrolls → starts session → Nexi teaches from that content. The gaps between the two apps (enrollment flow, course visibility, RAG content injection) were never verified.
**Rule**: Every cross-app flow gets a single Playwright test that opens both apps, performs actions in one, and verifies the result in the other. The Pomodoro keyword test pattern (upload unique content, then verify Nexi uses it) is the gold standard.

## Lesson 4: Don't silently skip steps in tests
**Date**: 2026-03-19
**Mistake**: Test code used `if (await btn.count() > 0) { ... }` patterns that silently skipped steps when elements weren't found. This made tests pass even when the UI was broken — the button wasn't there, the test just skipped it, and reported success.
**Rule**: If a button/element should be there and isn't, that's a test FAILURE, not a branch to handle. Use `await expect(element).toBeVisible()` which fails loudly.

## Lesson 5: Fix the root cause, not the symptom
**Date**: 2026-03-19
**Mistake**: The `[object Object]` error was treated as a frontend display bug (fix the alert). The real issue was the enrollment API failing — but nobody investigated WHY it failed because the error was swallowed. Multiple "fix" prompts were written for symptoms while root causes persisted.
**Rule**: When something breaks, diagnose the root cause first (add logging, read the actual error response), then fix from the bottom up. Don't fix the alert display and call it done.

## Lesson 6: State what you can't do, don't pretend you can
**Date**: 2026-03-19
**Mistake**: When asked for "end-to-end testing," the response implied the testing was happening visually in a browser. It wasn't — there's no browser available. The user expected UI-level verification and got API-level curl commands disguised as "end-to-end." This wasted multiple rounds of back-and-forth.
**Rule**: If you can't do something (like open a browser), say so immediately and offer the right alternative (Playwright). Don't let the user believe something is happening that isn't.
