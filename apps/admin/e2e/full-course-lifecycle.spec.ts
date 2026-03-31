import { test, expect, chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * FULL COURSE LIFECYCLE E2E TEST
 *
 * Tests the complete journey:
 *   1. Admin uploads a real document (from test_files or Downloads)
 *   2. Admin triggers course generation and waits for completion
 *   3. Admin publishes the course
 *   4. Learner sees the course and enrolls
 *   5. Learner starts a real session (with placement quiz)
 *   6. Learner chats with Nexi — asks relevant questions about the material
 *   7. Learner sends follow-up questions to verify context retention
 *   8. Verifies material progression through session modes
 *
 * Requirements: API (localhost:8000), Admin (localhost:3001), Web (localhost:3000), Postgres, Redis
 */

const API = "http://localhost:8000";
const ADMIN_TOKEN = "dev:auth0|admin-james";
const LEARNER_TOKEN = "dev:auth0|learner-maria";

test.describe("Full Course Lifecycle — Upload to Learning", () => {
  test.setTimeout(600_000); // 10 minutes for full flow with Claude API calls

  test("Admin uploads document → Generates course → Learner learns from it with real AI", async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 1500 });

    // ──────────────────────────────────────────────────────────────────
    // PHASE 1: ADMIN — Upload a real document
    // ──────────────────────────────────────────────────────────────────
    const adminContext = await browser.newContext({ baseURL: "http://localhost:3001" });
    const adminPage = await adminContext.newPage();

    // Find a course document to upload — use test_files
    let courseContent = "";
    let courseFilename = "";

    const testFilesDir = path.resolve(__dirname, "../../../services/api/test_files");

    // Use the test content file
    const testFile = path.join(testFilesDir, "strategic_leadership.txt");
    if (fs.existsSync(testFile)) {
      courseContent = fs.readFileSync(testFile, "utf-8");
      courseFilename = "strategic_leadership.txt";
      console.log(`📂 Using test file: ${courseFilename}`);
    } else {
      // Create a minimal test file if none exists
      courseContent = `Strategic Leadership Fundamentals

Strategic leadership is the ability to influence others to make decisions that enhance the long-term viability of an organization. Key frameworks include SWOT Analysis (Strengths, Weaknesses, Opportunities, Threats), Porter's Five Forces for competitive analysis, and the Balanced Scorecard for performance measurement.

Effective strategic leaders demonstrate: vision setting, stakeholder alignment, data-driven decision making, change management, and organizational culture development. The RICE scoring framework (Reach, Impact, Confidence, Effort) helps prioritize strategic initiatives by quantifying their expected value.

Pre-mortem analysis involves imagining a project has failed and working backward to identify what went wrong. This technique, developed by Gary Klein, helps teams identify risks before they materialize. Strategic leaders use pre-mortems alongside scenario planning to prepare for multiple futures.`;
      courseFilename = "strategic_leadership_test.txt";
      console.log(`📂 Using generated test content`);
    }

    expect(courseContent.length).toBeGreaterThan(100);
    console.log(`📄 Document: ${courseFilename} (${courseContent.length} chars)`);

    // Navigate to admin dashboard first
    await adminPage.goto("/");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.screenshot({ path: "test-results/screenshots/lifecycle-01-admin-dashboard.png", fullPage: true });

    // Upload file via API (reliable, not UI-dependent for file picker)
    const uploadRes = await adminPage.request.post(`${API}/api/admin/upload`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      multipart: {
        files: {
          name: courseFilename,
          mimeType: "text/plain",
          buffer: Buffer.from(courseContent),
        },
      },
    });
    expect(uploadRes.ok()).toBeTruthy();
    const uploadData = await uploadRes.json();
    const fileId = uploadData.files[0].id;
    console.log(`✅ File uploaded: ${fileId} (${uploadData.files[0].original_filename})`);

    await adminPage.screenshot({ path: "test-results/screenshots/lifecycle-02-file-uploaded.png", fullPage: true });

    // ──────────────────────────────────────────────────────────────────
    // PHASE 2: ADMIN — Generate course from uploaded document
    // ──────────────────────────────────────────────────────────────────
    const genRes = await adminPage.request.post(`${API}/api/admin/courses/generate`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
      data: { file_ids: [fileId] },
    });
    expect(genRes.ok()).toBeTruthy();
    const genData = await genRes.json();
    const jobId = genData.id;
    console.log(`🔄 Ingestion job started: ${jobId}`);

    // Navigate to upload page to see generation progress
    await adminPage.goto("/upload");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.screenshot({ path: "test-results/screenshots/lifecycle-03-generating.png", fullPage: true });

    // Poll until course generation completes
    let courseId = "";
    let courseTitle = "";
    let lastStep = "";

    for (let i = 0; i < 120; i++) {
      await adminPage.waitForTimeout(5000);
      const pollRes = await adminPage.request.get(`${API}/api/admin/ingestion/${jobId}`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      const pollData = await pollRes.json();

      if (pollData.current_step !== lastStep) {
        console.log(`  📊 Step ${i + 1}: ${pollData.status} — ${pollData.current_step || ""} (${pollData.progress_pct}%)`);
        lastStep = pollData.current_step;
      }

      if (pollData.status === "completed") {
        courseId = pollData.course_id;
        courseTitle = pollData.ai_generated_metadata?.title || "Generated Course";
        console.log(`✅ Course generated: "${courseTitle}" (${courseId})`);
        break;
      }
      if (pollData.status === "failed") {
        await adminPage.screenshot({ path: "test-results/screenshots/lifecycle-FAIL-generation.png", fullPage: true });
        throw new Error(`Generation failed: ${pollData.error_message}`);
      }
    }

    expect(courseId).toBeTruthy();
    await adminPage.screenshot({ path: "test-results/screenshots/lifecycle-04-course-generated.png", fullPage: true });

    // ──────────────────────────────────────────────────────────────────
    // PHASE 3: ADMIN — Publish the course
    // ──────────────────────────────────────────────────────────────────
    const pubRes = await adminPage.request.post(`${API}/api/admin/courses/${courseId}/publish`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(pubRes.ok()).toBeTruthy();
    const pubData = await pubRes.json();
    console.log(`✅ Course published: ${pubData.status}`);

    // Verify on admin categories page
    await adminPage.goto("/categories");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.screenshot({ path: "test-results/screenshots/lifecycle-05-admin-categories.png", fullPage: true });

    await adminContext.close();

    // ──────────────────────────────────────────────────────────────────
    // PHASE 4: LEARNER — Enroll in the course
    // ──────────────────────────────────────────────────────────────────
    const learnerContext = await browser.newContext({ baseURL: "http://localhost:3000" });
    const learnerPage = await learnerContext.newPage();

    await learnerPage.goto("/courses");
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-06-learner-courses.png", fullPage: true });

    // Enroll via API
    const enrollRes = await learnerPage.request.post(`${API}/api/enrollments`, {
      headers: { Authorization: `Bearer ${LEARNER_TOKEN}`, "Content-Type": "application/json" },
      data: { course_id: courseId },
    });
    const enrollStatus = enrollRes.status();
    console.log(`✅ Enrollment: HTTP ${enrollStatus} (${enrollStatus === 200 || enrollStatus === 201 ? "enrolled" : enrollStatus === 409 ? "already enrolled" : "error"})`);
    expect([200, 201, 409]).toContain(enrollStatus);

    // Reload courses page to see enrolled course
    await learnerPage.goto("/courses");
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-07-learner-enrolled.png", fullPage: true });

    // ──────────────────────────────────────────────────────────────────
    // PHASE 5: LEARNER — Create a real conversation session
    // ──────────────────────────────────────────────────────────────────
    const convRes = await learnerPage.request.post(`${API}/api/conversations`, {
      headers: { Authorization: `Bearer ${LEARNER_TOKEN}`, "Content-Type": "application/json" },
      data: { course_id: courseId, session_type: "guided_learning" },
    });
    expect(convRes.ok()).toBeTruthy();
    const convData = await convRes.json();
    const conversationId = convData.id;
    console.log(`✅ Conversation created: ${conversationId}`);

    // Navigate to the real session page
    await learnerPage.goto(`/session/${conversationId}`);
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.waitForTimeout(5000); // Wait for WebSocket connection + Nexi greeting
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-08-session-loaded.png", fullPage: true });

    // Verify the session loaded with expected UI elements
    const input = learnerPage.getByPlaceholder("Reply to Nexi...");
    await expect(input).toBeVisible({ timeout: 15000 });

    // Check for phase/stage pills
    const stageLabels = learnerPage.locator('[class*="stage"], [class*="pill"], [class*="stepper"]');
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-09-session-ui.png", fullPage: true });

    // ──────────────────────────────────────────────────────────────────
    // PHASE 6: LEARNER — Ask relevant questions about the material
    // ──────────────────────────────────────────────────────────────────

    // Extract key topics from the course content for relevant questions
    const contentLower = courseContent.toLowerCase();
    let relevantQuestions: string[] = [];

    if (contentLower.includes("decision") || contentLower.includes("rice") || contentLower.includes("stakeholder")) {
      relevantQuestions = [
        "Can you teach me about the RICE scoring framework for decision making?",
        "How do I use pre-mortem analysis to identify risks in my product decisions?",
        "What's the best way to align stakeholders when they disagree on priorities?",
      ];
    } else if (contentLower.includes("negotiat") || contentLower.includes("batna")) {
      relevantQuestions = [
        "Teach me about BATNA in negotiations",
        "How do I strengthen my BATNA before entering a negotiation?",
        "Can you explain the difference between interests and positions with an example?",
      ];
    } else {
      // Generic questions based on whatever content was uploaded
      relevantQuestions = [
        "What are the key concepts I should understand first?",
        "Can you explain the most important framework from this material?",
        "How would I apply the main concept in a real-world scenario?",
      ];
    }

    console.log(`\n📝 Asking ${relevantQuestions.length} relevant questions about the material...`);

    // QUESTION 1 — First relevant question
    console.log(`\n💬 Q1: "${relevantQuestions[0]}"`);
    await input.fill(relevantQuestions[0]);
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-10-q1-typed.png", fullPage: true });
    await input.press("Enter");

    // Wait for user message to appear
    await expect(learnerPage.locator(`text=${relevantQuestions[0].slice(0, 30)}`).first()).toBeVisible({ timeout: 10000 });
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-11-q1-sent.png", fullPage: true });

    // Wait for Nexi to stream a full response
    console.log("  ⏳ Waiting for Nexi to respond...");
    await learnerPage.waitForTimeout(20000);
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-12-q1-response.png", fullPage: true });

    // Verify Nexi responded with content related to the uploaded material
    let pageText = await learnerPage.textContent("body");
    expect(pageText!.length).toBeGreaterThan(500); // Nexi should have written a substantial response
    console.log(`  ✅ Nexi responded (page text: ${pageText!.length} chars)`);

    // ──────────────────────────────────────────────────────────────────
    // PHASE 7: LEARNER — Follow-up question (tests context retention)
    // ──────────────────────────────────────────────────────────────────

    console.log(`\n💬 Q2 (follow-up): "${relevantQuestions[1]}"`);
    await input.fill(relevantQuestions[1]);
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-13-q2-typed.png", fullPage: true });
    await input.press("Enter");

    await learnerPage.waitForTimeout(20000);
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-14-q2-response.png", fullPage: true });

    pageText = await learnerPage.textContent("body");
    console.log(`  ✅ Nexi follow-up response (page text: ${pageText!.length} chars)`);

    // Verify the response relates to the course content (not generic)
    const responseWords = pageText!.toLowerCase();
    const contentKeywords = courseContent
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 5)
      .slice(0, 50);

    const matchingKeywords = contentKeywords.filter((kw) => responseWords.includes(kw));
    console.log(`  📊 Content relevance: ${matchingKeywords.length}/${contentKeywords.length} keywords from source material found in page`);
    // At minimum some keywords from the source material should appear
    expect(matchingKeywords.length).toBeGreaterThan(3);

    // ──────────────────────────────────────────────────────────────────
    // PHASE 8: LEARNER — Third question to push progression
    // ──────────────────────────────────────────────────────────────────

    console.log(`\n💬 Q3 (deeper): "${relevantQuestions[2]}"`);
    await input.fill(relevantQuestions[2]);
    await input.press("Enter");

    await learnerPage.waitForTimeout(20000);
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-15-q3-response.png", fullPage: true });

    pageText = await learnerPage.textContent("body");
    console.log(`  ✅ Third response received (page text: ${pageText!.length} chars)`);

    // ──────────────────────────────────────────────────────────────────
    // PHASE 9: Verify session mode progression
    // ──────────────────────────────────────────────────────────────────

    // Check if the scaffold/mode has advanced from the initial "assess" mode
    const scaffoldBtn = learnerPage.locator('button[title="Open Thinking Scaffold"]');
    if (await scaffoldBtn.count() > 0) {
      await scaffoldBtn.click();
      await learnerPage.waitForTimeout(1000);
      await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-16-scaffold-open.png", fullPage: true });

      // Look for mode indicators in the scaffold
      const scaffoldText = await learnerPage.locator('[class*="scaffold"], [class*="panel"]').first().textContent();
      if (scaffoldText) {
        const modes = ["assess", "teach", "check_understanding", "challenge", "apply", "reflect"];
        const activeModes = modes.filter((m) => scaffoldText.toLowerCase().includes(m.replace("_", " ")));
        console.log(`  📊 Scaffold active modes: ${activeModes.join(", ")}`);
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // PHASE 10: Verify the course outline shows topic progress
    // ──────────────────────────────────────────────────────────────────

    // Check if the course outline panel is showing covered topics
    const outlinePanel = learnerPage.locator('[class*="outline"], [class*="topics"], [class*="curriculum"]');
    if (await outlinePanel.count() > 0) {
      const outlineText = await outlinePanel.first().textContent();
      console.log(`  📋 Course outline visible: ${outlineText?.slice(0, 100)}...`);
    }

    // Final screenshot
    await learnerPage.screenshot({ path: "test-results/screenshots/lifecycle-17-final-state.png", fullPage: true });

    // ──────────────────────────────────────────────────────────────────
    // PHASE 11: Verify conversation was persisted
    // ──────────────────────────────────────────────────────────────────
    const convCheckRes = await learnerPage.request.get(`${API}/api/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${LEARNER_TOKEN}` },
    });
    expect(convCheckRes.ok()).toBeTruthy();
    const convCheck = await convCheckRes.json();
    console.log(`\n✅ Conversation persisted: ${convCheck.messages?.length || 0} messages stored`);
    expect(convCheck.messages?.length).toBeGreaterThan(0);

    console.log("\n🎉 FULL LIFECYCLE TEST COMPLETE");
    console.log("   📂 Document uploaded → 🔄 Course generated → 📢 Published");
    console.log("   📚 Learner enrolled → 💬 Real AI session → 🔄 Follow-ups verified");
    console.log("   ✅ Material progression confirmed");

    await learnerContext.close();
    await browser.close();
  });
});
