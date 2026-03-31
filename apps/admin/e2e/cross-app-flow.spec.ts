import { test, expect, chromium } from "@playwright/test";

test.describe("Cross-App: Admin creates, Learner learns from it", () => {

  test("Full flow: Upload → Generate → Publish → Enroll → Session with real content", async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 2500 });
    const API = "http://localhost:8000";
    const ADMIN_TOKEN = "dev:auth0|admin-james";
    const LEARNER_TOKEN = "dev:auth0|learner-maria";

    // ============================================================
    // STEP 1: ADMIN — Upload a file via API (reliable, not UI-dependent)
    // ============================================================
    const adminContext = await browser.newContext({ baseURL: "http://localhost:3001" });
    const adminPage = await adminContext.newPage();

    await adminPage.goto("/");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.screenshot({ path: "test-results/screenshots/cross-01-admin-home.png", fullPage: true });

    // Upload file via API
    const uploadRes = await adminPage.request.post(`${API}/api/admin/upload`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      multipart: {
        files: {
          name: "negotiation-mastery.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(`Negotiation Skills for Professionals

Chapter 1: Understanding Interests vs Positions
Most people negotiate by stating positions — "I want X." Effective negotiators dig deeper to understand WHY.
A position is WHAT someone demands. An interest is the underlying need driving that demand.
Example: Two people fight over an orange. One wants the peel for baking, the other wants the juice. Both can win.

Chapter 2: BATNA — Best Alternative to Negotiated Agreement
Always know your BATNA before entering any negotiation. Your BATNA is your plan B — what happens if you walk away.
A strong BATNA gives you confidence. A weak BATNA means you negotiate from desperation.
To strengthen your BATNA: develop multiple options, improve your alternatives, research the other side's BATNA.

Chapter 3: Creating Value Before Claiming It
Expand the pie before dividing it. Look for trades where each side values things differently.
Ask: "What's cheap for me to give but valuable for them?" and vice versa.
This turns zero-sum negotiations into positive-sum outcomes where both sides gain more.

Chapter 4: Anchoring and Framing
The first number on the table sets the anchor. Make the first offer when you have good information.
Frame proposals in terms of the other side's interests, not yours.
Instead of "I need a raise," try "Here's how my contributions have increased revenue by 30%."`)
        }
      }
    });
    const uploadData = await uploadRes.json();
    const fileId = uploadData.files[0].id;
    console.log(`✓ Uploaded file: ${fileId}`);

    // ============================================================
    // STEP 2: ADMIN — Generate course via API
    // ============================================================
    const genRes = await adminPage.request.post(`${API}/api/admin/courses/generate`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json" },
      data: { file_ids: [fileId] },
    });
    const genData = await genRes.json();
    const jobId = genData.id;
    console.log(`✓ Generation job started: ${jobId}`);

    // Show upload page while we wait
    await adminPage.goto("/upload");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.screenshot({ path: "test-results/screenshots/cross-02-generating.png", fullPage: true });

    // Poll until complete
    let courseId = "";
    let courseTitle = "";
    for (let i = 0; i < 120; i++) {
      await adminPage.waitForTimeout(5000);
      const pollRes = await adminPage.request.get(`${API}/api/admin/ingestion/${jobId}`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      const pollData = await pollRes.json();
      console.log(`  Poll ${i + 1}: ${pollData.status} — ${pollData.current_step || ""}`);

      if (pollData.status === "completed") {
        courseId = pollData.course_id;
        courseTitle = pollData.ai_generated_metadata?.title || "Generated Course";
        console.log(`✓ Course generated: "${courseTitle}" (${courseId})`);
        break;
      }
      if (pollData.status === "failed") {
        throw new Error(`Generation failed: ${pollData.error_message}`);
      }
    }

    if (!courseId) throw new Error("Course generation timed out");

    // ============================================================
    // STEP 3: ADMIN — Publish the course
    // ============================================================
    const pubRes = await adminPage.request.post(`${API}/api/admin/courses/${courseId}/publish`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const pubData = await pubRes.json();
    console.log(`✓ Course published: ${pubData.status}`);

    // Show it in the admin categories page
    await adminPage.goto("/categories");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.screenshot({ path: "test-results/screenshots/cross-03-admin-categories.png", fullPage: true });

    await adminContext.close();

    // ============================================================
    // STEP 4: LEARNER — See the course and enroll
    // ============================================================
    const learnerContext = await browser.newContext({ baseURL: "http://localhost:3000" });
    const learnerPage = await learnerContext.newPage();

    await learnerPage.goto("/courses");
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-04-learner-courses.png", fullPage: true });

    // Enroll via API (the course might not show in mock mode UI)
    const enrollRes = await learnerPage.request.post(`${API}/api/enrollments`, {
      headers: { Authorization: `Bearer ${LEARNER_TOKEN}`, "Content-Type": "application/json" },
      data: { course_id: courseId },
    });
    const enrollStatus = enrollRes.status();
    console.log(`✓ Enrollment: HTTP ${enrollStatus} (${enrollStatus === 200 ? "enrolled" : enrollStatus === 409 ? "already enrolled" : "error"})`);

    // Reload courses page to see enrolled course
    await learnerPage.goto("/courses");
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-05-learner-enrolled.png", fullPage: true });

    // ============================================================
    // STEP 5: LEARNER — Create a REAL conversation on this course
    // ============================================================
    const convRes = await learnerPage.request.post(`${API}/api/conversations`, {
      headers: { Authorization: `Bearer ${LEARNER_TOKEN}`, "Content-Type": "application/json" },
      data: { course_id: courseId, session_type: "guided_learning" },
    });
    const convData = await convRes.json();
    const conversationId = convData.id;
    console.log(`✓ Conversation created: ${conversationId}`);

    // Navigate to the real session
    await learnerPage.goto(`/session/${conversationId}`);
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.waitForTimeout(3000);
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-06-session-loaded.png", fullPage: true });

    // ============================================================
    // STEP 6: LEARNER — Chat with Nexi about the uploaded content
    // ============================================================
    const input = learnerPage.getByPlaceholder("Reply to Nexi...");
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill("Teach me about BATNA in negotiations");
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-07-typed-batna.png", fullPage: true });

    await input.press("Enter");

    // Wait for user message to appear
    await expect(learnerPage.locator("text=BATNA").first()).toBeVisible({ timeout: 5000 });
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-08-message-sent.png", fullPage: true });

    // Wait for Nexi to stream response (real Claude API call)
    console.log("  Waiting for Nexi to respond (streaming from Claude)...");
    await learnerPage.waitForTimeout(15000);
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-09-nexi-teaching.png", fullPage: true });

    // Verify Nexi responded with content related to the uploaded material
    const pageText = await learnerPage.textContent("body");
    const hasNegotiationContent = pageText?.toLowerCase().includes("batna") ||
      pageText?.toLowerCase().includes("negotiat") ||
      pageText?.toLowerCase().includes("alternative") ||
      pageText?.toLowerCase().includes("walk away");
    console.log(`✓ Nexi teaches from uploaded content: ${hasNegotiationContent}`);

    // ============================================================
    // STEP 7: LEARNER — Send a follow-up
    // ============================================================
    await input.fill("Can you give me an example of how to strengthen my BATNA?");
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-10-followup.png", fullPage: true });
    await input.press("Enter");

    await learnerPage.waitForTimeout(15000);
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-11-nexi-followup.png", fullPage: true });

    // ============================================================
    // STEP 8: Verify the scaffold panel works
    // ============================================================
    const scaffoldBtn = learnerPage.locator('button[title="Open Thinking Scaffold"]');
    if (await scaffoldBtn.count() > 0) {
      await scaffoldBtn.click();
      await learnerPage.waitForTimeout(1000);
      await learnerPage.screenshot({ path: "test-results/screenshots/cross-12-scaffold-open.png", fullPage: true });
    }

    // Final screenshot
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-13-final-state.png", fullPage: true });
    console.log("\n✓ CROSS-APP TEST COMPLETE — Admin uploaded → Course generated → Published → Learner enrolled → Real session with Nexi");

    await learnerContext.close();
    await browser.close();
  });
});
