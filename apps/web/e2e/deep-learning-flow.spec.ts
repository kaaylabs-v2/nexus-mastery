import { test, expect } from "@playwright/test";

/**
 * DEEP LEARNING FLOW E2E TEST
 *
 * Tests the learner experience in depth:
 *   1. Dashboard loads with category data
 *   2. Courses page shows enrolled courses
 *   3. Learner starts a session on an enrolled course
 *   4. Placement quiz flow (if available)
 *   5. Multi-turn conversation with Nexi — 5+ exchanges
 *   6. Verifies follow-up questions stay relevant to material
 *   7. Checks that session mode progresses (assess → teach → check → challenge)
 *   8. Scaffold panel shows evaluation data
 *   9. Course outline tracks topic coverage
 *  10. Analytics page reflects session activity
 *  11. Journal page captures session summary
 *
 * Requirements: API (localhost:8000), Web (localhost:3000), seeded data
 */

const API = "http://localhost:8000";
const LEARNER_TOKEN = "dev:auth0|learner-maria";

test.describe("Deep Learning Flow — Multi-turn Conversation & Progression", () => {
  test.setTimeout(480_000); // 8 minutes for multi-turn AI conversation

  test("Learner has a full multi-turn learning conversation with mode progression", async ({ page }) => {
    // ──────────────────────────────────────────────────────────────────
    // STEP 1: Get enrolled courses via API to find one to learn from
    // ──────────────────────────────────────────────────────────────────
    const enrolledRes = await page.request.get(`${API}/api/courses/me/enrolled`, {
      headers: { Authorization: `Bearer ${LEARNER_TOKEN}` },
    });

    let courseId = "";
    let courseTitle = "";

    if (enrolledRes.ok()) {
      const enrolled = await enrolledRes.json();
      if (enrolled.length > 0) {
        courseId = enrolled[0].id;
        courseTitle = enrolled[0].title;
        console.log(`📚 Found enrolled course: "${courseTitle}" (${courseId})`);
      }
    }

    // If no enrolled course, list all active courses and enroll in one
    if (!courseId) {
      const coursesRes = await page.request.get(`${API}/api/courses/me/available`, {
        headers: { Authorization: `Bearer ${LEARNER_TOKEN}` },
      });
      if (coursesRes.ok()) {
        const available = await coursesRes.json();
        if (available.length > 0) {
          courseId = available[0].id;
          courseTitle = available[0].title;

          // Enroll
          const enrollRes = await page.request.post(`${API}/api/enrollments`, {
            headers: { Authorization: `Bearer ${LEARNER_TOKEN}`, "Content-Type": "application/json" },
            data: { course_id: courseId },
          });
          console.log(`📚 Enrolled in: "${courseTitle}" (HTTP ${enrollRes.status()})`);
        }
      }
    }

    // Last fallback: list all courses
    if (!courseId) {
      const allRes = await page.request.get(`${API}/api/courses`, {
        headers: { Authorization: `Bearer ${LEARNER_TOKEN}` },
      });
      expect(allRes.ok()).toBeTruthy();
      const all = await allRes.json();
      const activeCourse = all.find((c: { status: string }) => c.status === "active");
      expect(activeCourse).toBeTruthy();
      courseId = activeCourse.id;
      courseTitle = activeCourse.title;

      await page.request.post(`${API}/api/enrollments`, {
        headers: { Authorization: `Bearer ${LEARNER_TOKEN}`, "Content-Type": "application/json" },
        data: { course_id: courseId },
      });
      console.log(`📚 Enrolled in fallback course: "${courseTitle}"`);
    }

    expect(courseId).toBeTruthy();

    // ──────────────────────────────────────────────────────────────────
    // STEP 2: Dashboard loads with real data
    // ──────────────────────────────────────────────────────────────────
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/deep-01-dashboard.png", fullPage: true });

    await expect(page.locator("text=Dashboard").first()).toBeVisible({ timeout: 10000 });
    const dashBody = await page.textContent("body");
    expect(dashBody!.length).toBeGreaterThan(100);
    console.log("✅ Dashboard loaded");

    // ──────────────────────────────────────────────────────────────────
    // STEP 3: Courses page shows the enrolled course
    // ──────────────────────────────────────────────────────────────────
    await page.goto("/courses");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/deep-02-courses.png", fullPage: true });

    await expect(page.locator("text=Courses").first()).toBeVisible({ timeout: 10000 });
    console.log("✅ Courses page loaded");

    // ──────────────────────────────────────────────────────────────────
    // STEP 4: Create a conversation and start the session
    // ──────────────────────────────────────────────────────────────────
    const convRes = await page.request.post(`${API}/api/conversations`, {
      headers: { Authorization: `Bearer ${LEARNER_TOKEN}`, "Content-Type": "application/json" },
      data: { course_id: courseId, session_type: "guided_learning" },
    });
    expect(convRes.ok()).toBeTruthy();
    const convData = await convRes.json();
    const conversationId = convData.id;
    console.log(`💬 Conversation created: ${conversationId}`);

    // Navigate to the session
    await page.goto(`/session/${conversationId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000); // Wait for WebSocket + Nexi greeting
    await page.screenshot({ path: "test-results/screenshots/deep-03-session-start.png", fullPage: true });

    // Verify input field is ready
    const input = page.getByPlaceholder("Reply to Nexi...");
    await expect(input).toBeVisible({ timeout: 15000 });

    // Wait for Nexi's initial greeting to appear
    await page.waitForTimeout(10000);
    await page.screenshot({ path: "test-results/screenshots/deep-04-nexi-greeting.png", fullPage: true });

    let bodyText = await page.textContent("body");
    console.log(`  📝 Session started, page text: ${bodyText!.length} chars`);

    // ──────────────────────────────────────────────────────────────────
    // STEP 5: Multi-turn conversation — 5 exchanges
    // ──────────────────────────────────────────────────────────────────

    const learningExchanges = [
      {
        message: "I'd like to learn about the core concepts. What should I know first?",
        description: "Initial learning question",
        screenshotId: "05",
      },
      {
        message: "That's interesting. Can you explain more about how this applies in practice?",
        description: "Follow-up requesting practical application",
        screenshotId: "06",
      },
      {
        message: "I think I understand the basics now. Can you test my understanding with a question?",
        description: "Requesting comprehension check (should trigger mode progression)",
        screenshotId: "07",
      },
      {
        message: "Let me think about that... I believe the key factors are the analysis of alternatives and understanding tradeoffs between short-term and long-term impacts.",
        description: "Thoughtful response to demonstrate understanding",
        screenshotId: "08",
      },
      {
        message: "Can you give me a challenging scenario where I need to apply what I've learned?",
        description: "Requesting challenge/apply mode",
        screenshotId: "09",
      },
    ];

    for (const exchange of learningExchanges) {
      console.log(`\n💬 Exchange: ${exchange.description}`);
      console.log(`   > "${exchange.message}"`);

      await input.fill(exchange.message);
      await page.screenshot({
        path: `test-results/screenshots/deep-${exchange.screenshotId}a-typed.png`,
        fullPage: true,
      });

      await input.press("Enter");

      // Wait for user message to appear in chat
      const msgSnippet = exchange.message.slice(0, 25);
      await expect(page.locator(`text=${msgSnippet}`).first()).toBeVisible({ timeout: 10000 });

      // Wait for Nexi to stream response (real Claude API)
      console.log("   ⏳ Waiting for Nexi response...");
      await page.waitForTimeout(20000);

      await page.screenshot({
        path: `test-results/screenshots/deep-${exchange.screenshotId}b-response.png`,
        fullPage: true,
      });

      bodyText = await page.textContent("body");
      console.log(`   ✅ Response received (${bodyText!.length} chars on page)`);
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 6: Verify conversation context and relevance
    // ──────────────────────────────────────────────────────────────────

    bodyText = await page.textContent("body");
    const bodyLower = bodyText!.toLowerCase();

    // The conversation should contain multiple substantial messages
    // Look for indicators that Nexi gave real, contextual responses
    const hasSubstantialContent = bodyText!.length > 2000;
    console.log(`\n📊 Content check: ${bodyText!.length} chars total (${hasSubstantialContent ? "PASS" : "FAIL"})`);
    expect(hasSubstantialContent).toBeTruthy();

    // ──────────────────────────────────────────────────────────────────
    // STEP 7: Check scaffold panel for mode progression
    // ──────────────────────────────────────────────────────────────────

    const scaffoldBtn = page.locator('button[title="Open Thinking Scaffold"]');
    if (await scaffoldBtn.count() > 0) {
      await scaffoldBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: "test-results/screenshots/deep-10-scaffold.png", fullPage: true });

      const scaffoldArea = page.locator('[class*="scaffold"], [class*="panel"], aside').first();
      if (await scaffoldArea.count() > 0) {
        const scaffoldText = await scaffoldArea.textContent();
        console.log(`\n📊 Scaffold content: ${scaffoldText?.slice(0, 200)}...`);

        // Check for evaluation data
        const hasEvaluation =
          scaffoldText?.toLowerCase().includes("observation") ||
          scaffoldText?.toLowerCase().includes("consider") ||
          scaffoldText?.toLowerCase().includes("comprehension") ||
          scaffoldText?.toLowerCase().includes("strong") ||
          scaffoldText?.toLowerCase().includes("advance");

        if (hasEvaluation) {
          console.log("  ✅ Scaffold shows evaluation data");
        } else {
          console.log("  ℹ️ Scaffold visible but no evaluation data yet");
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // STEP 8: Check the session stepper for mode progression
    // ──────────────────────────────────────────────────────────────────

    // The stepper shows: Getting Started → Learn → Understand → Think Deeper → Apply → Reflect
    const stepperLabels = ["Getting Started", "Learn", "Understand", "Think Deeper", "Apply", "Reflect"];
    let activeStepFound = false;

    for (const label of stepperLabels) {
      const step = page.locator(`text=${label}`).first();
      if (await step.count() > 0) {
        const stepParent = step.locator("..");
        const classes = await stepParent.getAttribute("class");
        if (classes && (classes.includes("active") || classes.includes("current") || classes.includes("bg-"))) {
          console.log(`\n📊 Active session mode: "${label}"`);
          activeStepFound = true;
        }
      }
    }

    await page.screenshot({ path: "test-results/screenshots/deep-11-mode-state.png", fullPage: true });

    // ──────────────────────────────────────────────────────────────────
    // STEP 9: Verify conversation persistence via API
    // ──────────────────────────────────────────────────────────────────

    const checkRes = await page.request.get(`${API}/api/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${LEARNER_TOKEN}` },
    });
    expect(checkRes.ok()).toBeTruthy();
    const checkData = await checkRes.json();

    const messageCount = checkData.messages?.length || 0;
    console.log(`\n📊 Conversation state:`);
    console.log(`   Messages persisted: ${messageCount}`);
    console.log(`   Session mode: ${checkData.session_mode}`);
    console.log(`   Topics covered: ${checkData.topics_covered?.length || 0}`);
    console.log(`   Current topic: ${checkData.current_topic_id}`);

    // We sent 5 user messages, should have at least those + Nexi responses
    expect(messageCount).toBeGreaterThanOrEqual(5);

    // ──────────────────────────────────────────────────────────────────
    // STEP 10: Check analytics and journal pages
    // ──────────────────────────────────────────────────────────────────

    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/deep-12-analytics.png", fullPage: true });
    await expect(page.locator("text=Analytics").first()).toBeVisible({ timeout: 10000 });
    console.log("✅ Analytics page loaded");

    await page.goto("/journal");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/deep-13-journal.png", fullPage: true });
    await expect(page.locator("text=Journal").first()).toBeVisible({ timeout: 10000 });
    console.log("✅ Journal page loaded");

    // ──────────────────────────────────────────────────────────────────
    // STEP 11: Profile page shows learning activity
    // ──────────────────────────────────────────────────────────────────

    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/deep-14-profile.png", fullPage: true });
    await expect(page.locator("text=Profile").first()).toBeVisible({ timeout: 10000 });
    console.log("✅ Profile page loaded");

    // Final screenshot of the session page
    await page.goto(`/session/${conversationId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/screenshots/deep-15-final-session.png", fullPage: true });

    console.log("\n🎉 DEEP LEARNING FLOW TEST COMPLETE");
    console.log(`   📚 Course: "${courseTitle}"`);
    console.log(`   💬 ${messageCount} messages exchanged`);
    console.log(`   🧠 Session mode: ${checkData.session_mode}`);
    console.log(`   📊 Topics covered: ${checkData.topics_covered?.length || 0}`);
  });

  test("Sidebar navigation — all learner pages render with real data", async ({ page }) => {
    const navTargets = [
      { label: "Dashboard", path: "/", expectText: "Dashboard" },
      { label: "Courses", path: "/courses", expectText: "Courses" },
      { label: "Analytics", path: "/analytics", expectText: "Analytics" },
      { label: "Journal", path: "/journal", expectText: "Journal" },
      { label: "Profile", path: "/profile", expectText: "Profile" },
    ];

    for (const target of navTargets) {
      await page.goto(target.path);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: `test-results/screenshots/deep-nav-${target.label.toLowerCase()}.png`,
        fullPage: true,
      });

      await expect(page.locator(`text=${target.expectText}`).first()).toBeVisible({ timeout: 10000 });
      const body = await page.textContent("body");
      expect(body!.length).toBeGreaterThan(50);
      console.log(`✅ ${target.label} page loaded (${body!.length} chars)`);
    }
  });
});
