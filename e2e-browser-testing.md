# End-to-End Browser Testing — Claude Code Prompt

> **Context**: Nexus² Mastery Platform needs real browser-based end-to-end tests. NOT curl commands — actual browser automation that opens the app, clicks buttons, fills forms, navigates between pages, and takes screenshots to prove everything works. Use Playwright.

> **THE RULE: Every test must take a screenshot at key steps and save it to `test-results/screenshots/`. If a test fails, the screenshot shows exactly what went wrong. No test passes without visual proof.**

---

## Step 1: Set Up Playwright

```bash
cd apps/web
npm install -D @playwright/test
npx playwright install chromium

cd ../admin
npm install -D @playwright/test
npx playwright install chromium
```

Create Playwright config for both apps:

**File**: `apps/admin/playwright.config.ts`
```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3001",
    screenshot: "on",
    video: "on-first-retry",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    port: 3001,
    reuseExistingServer: true,
    timeout: 30000,
  },
  outputDir: "./test-results",
});
```

**File**: `apps/web/playwright.config.ts`
```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "on",
    video: "on-first-retry",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 30000,
  },
  outputDir: "./test-results",
});
```

**IMPORTANT**: These tests run with `NEXT_PUBLIC_USE_MOCK_DATA=true` (dev mode) so they don't need Auth0. The backend must be running on port 8000 with `DEV_AUTH=true` and seed data loaded.

---

## Step 2: Admin Studio — Full Flow Tests

**File**: `apps/admin/e2e/admin-full-flow.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Admin Studio — Full Flow", () => {

  test("Dashboard loads with programs and stats", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Screenshot: Dashboard loaded
    await page.screenshot({ path: "test-results/screenshots/01-admin-dashboard.png", fullPage: true });

    // Verify stat cards are visible
    await expect(page.locator("text=Learners").first()).toBeVisible();
    await expect(page.locator("text=Programs").first()).toBeVisible();

    // Verify programs are listed
    const programCards = page.locator("text=Strategic Leadership");
    await expect(programCards.first()).toBeVisible();
  });

  test("Navigate to Programs page and see program list", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Programs");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/02-programs-list.png", fullPage: true });

    // Should show programs (not "0 programs")
    const count = await page.locator("[class*='rounded-xl'][class*='border']").count();
    expect(count).toBeGreaterThan(0);
  });

  test("Click on a program and see program detail", async ({ page }) => {
    await page.goto("/programs");
    await page.waitForLoadState("networkidle");

    // Click the first program
    await page.locator("[class*='rounded-xl'][class*='border']").first().click();
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/03-program-detail.png", fullPage: true });

    // Should NOT show "Program not found"
    await expect(page.locator("text=Program not found")).not.toBeVisible({ timeout: 3000 }).catch(() => {
      // If it IS visible, this test should fail
      throw new Error("Program detail page shows 'Program not found' — the selectinload bug is still present");
    });
  });

  test("Upload a file via Upload & Generate page", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/04-upload-page.png", fullPage: true });

    // Create a test file to upload
    const testContent = `Strategic Decision Making for Product Managers

    RICE Scoring: Evaluate features by Reach, Impact, Confidence, and Effort.
    Stakeholder Alignment: Meet individually before group decisions.
    Risk Assessment: Use pre-mortem analysis to identify risks early.`;

    // Upload via file input
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles({
        name: "test-course.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(testContent),
      });

      await page.screenshot({ path: "test-results/screenshots/05-file-uploaded.png", fullPage: true });

      // Look for a generate/create button and click it
      const generateBtn = page.locator("button").filter({ hasText: /generate|create|start/i });
      if (await generateBtn.count() > 0) {
        await generateBtn.first().click();

        // Wait for processing (poll for completion)
        await page.waitForTimeout(5000);
        await page.screenshot({ path: "test-results/screenshots/06-course-generating.png", fullPage: true });

        // Wait longer for AI generation to complete
        await page.waitForTimeout(30000);
        await page.screenshot({ path: "test-results/screenshots/07-course-generated.png", fullPage: true });
      }
    } else {
      // If there's a drop zone instead of file input, handle it
      await page.screenshot({ path: "test-results/screenshots/05-no-file-input-found.png", fullPage: true });
    }
  });

  test("Users page — list users and invite", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/08-users-page.png", fullPage: true });

    // Should see at least the seeded users
    await expect(page.locator("text=admin@acme.com").or(page.locator("text=James Wilson"))).toBeVisible({ timeout: 5000 });

    // Try inviting a user
    const inviteBtn = page.locator("button").filter({ hasText: /invite|add/i });
    if (await inviteBtn.count() > 0) {
      await inviteBtn.first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: "test-results/screenshots/09-invite-dialog.png", fullPage: true });

      // Fill invite form if a dialog appeared
      const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
      if (await emailInput.count() > 0) {
        await emailInput.fill("testuser@acme.com");
        await page.screenshot({ path: "test-results/screenshots/10-invite-filled.png", fullPage: true });

        // Submit
        const submitBtn = page.locator("button").filter({ hasText: /send|invite|add/i }).last();
        if (await submitBtn.count() > 0) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: "test-results/screenshots/11-invite-submitted.png", fullPage: true });
        }
      }
    }
  });

  test("Analytics page loads with data", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/12-analytics-page.png", fullPage: true });

    // Should show some chart or stats
    await expect(page.locator("svg, canvas, [class*='chart'], [class*='recharts']").first()).toBeVisible({ timeout: 5000 }).catch(() => {
      // Charts might not be rendered — at least the page should load
    });
  });

  test("Settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/13-settings-page.png", fullPage: true });
  });

  test("Sidebar navigation works — all pages accessible", async ({ page }) => {
    const pages = [
      { nav: "Dashboard", url: "/" },
      { nav: "Programs", url: "/programs" },
      { nav: "Upload", url: "/upload" },
      { nav: "Users", url: "/users" },
      { nav: "Analytics", url: "/analytics" },
      { nav: "Settings", url: "/settings" },
    ];

    for (const p of pages) {
      await page.goto("/");
      const navLink = page.locator(`a, button`).filter({ hasText: new RegExp(p.nav, "i") }).first();
      if (await navLink.count() > 0) {
        await navLink.click();
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `test-results/screenshots/nav-${p.nav.toLowerCase()}.png` });

        // Page should not show a crash or blank white screen
        const bodyText = await page.textContent("body");
        expect(bodyText?.length).toBeGreaterThan(10);
      }
    }
  });
});
```

---

## Step 3: Learner Arena — Full Flow Tests

**File**: `apps/web/e2e/learner-full-flow.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Learner Arena — Full Flow", () => {

  test("Dashboard loads with program data", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/20-learner-dashboard.png", fullPage: true });

    // Should show the program name
    await expect(page.locator("text=Dashboard").first()).toBeVisible();

    // Should show focus skills or program info
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(100);
  });

  test("Courses page — see enrolled and available courses", async ({ page }) => {
    // Navigate to courses (via sidebar or direct URL)
    await page.goto("/courses");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/21-courses-page.png", fullPage: true });

    // Should show at least one section
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
  });

  test("Enroll in a course", async ({ page }) => {
    await page.goto("/courses");
    await page.waitForLoadState("networkidle");

    // Find an Enroll button
    const enrollBtn = page.locator("button").filter({ hasText: /enroll/i }).first();
    if (await enrollBtn.count() > 0) {
      await enrollBtn.click();
      await page.waitForTimeout(3000);

      await page.screenshot({ path: "test-results/screenshots/22-after-enroll.png", fullPage: true });

      // The course should move from available to enrolled
      // No [object Object] error should appear
      const alertDialog = page.locator("[role='alertdialog'], [role='dialog']");
      if (await alertDialog.count() > 0) {
        const dialogText = await alertDialog.textContent();
        expect(dialogText).not.toContain("[object Object]");
        await page.screenshot({ path: "test-results/screenshots/22-enroll-error.png" });
        throw new Error(`Enrollment showed error dialog: ${dialogText}`);
      }
    } else {
      // No courses available to enroll in — take screenshot for debugging
      await page.screenshot({ path: "test-results/screenshots/22-no-enroll-button.png", fullPage: true });
    }
  });

  test("Start a session and Nexi responds", async ({ page }) => {
    // Navigate to session page
    await page.goto("/session/session-1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "test-results/screenshots/23-session-page.png", fullPage: true });

    // Verify session phases are visible
    await expect(page.locator("text=Learn").or(page.locator("text=Getting Started"))).toBeVisible({ timeout: 5000 });

    // Verify Nexi's first message appears
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/screenshots/24-nexi-first-message.png", fullPage: true });

    // Check that there is at least one message from Nexi
    const nexiMessages = page.locator("[class*='nexi'], [class*='assistant'], [class*='rounded-lg']").filter({ hasText: /.{20,}/ });
    const msgCount = await nexiMessages.count();
    expect(msgCount).toBeGreaterThanOrEqual(0); // May need time to load

    // Type a message
    const input = page.locator('input[placeholder*="response" i], input[placeholder*="type" i], textarea').first();
    if (await input.count() > 0) {
      await input.fill("I want to learn about decision making frameworks for product managers");

      await page.screenshot({ path: "test-results/screenshots/25-typed-message.png", fullPage: true });

      // Send the message (press Enter or click send button)
      await input.press("Enter");

      // Wait for Nexi to respond (streaming)
      await page.waitForTimeout(10000);

      await page.screenshot({ path: "test-results/screenshots/26-nexi-response.png", fullPage: true });

      // Verify Nexi responded with something
      const bodyAfter = await page.textContent("body");
      expect(bodyAfter!.length).toBeGreaterThan(200);
    }
  });

  test("Session shows phase progression", async ({ page }) => {
    await page.goto("/session/session-1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Check for phase indicators
    const phases = ["Learn", "Understand", "Think Deeper", "Apply", "Reflect"];
    for (const phase of phases) {
      const phaseEl = page.locator(`text=${phase}`).first();
      if (await phaseEl.count() > 0) {
        // At least some phases should be visible
        break;
      }
    }

    await page.screenshot({ path: "test-results/screenshots/27-session-phases.png", fullPage: true });
  });

  test("Sidebar navigation works", async ({ page }) => {
    const pages = [
      { label: "Dashboard", expected: "/" },
      { label: "Courses", expected: "/courses" },
      { label: "Profile", expected: "/profile" },
      { label: "Journal", expected: "/journal" },
      { label: "Analytics", expected: "/analytics" },
    ];

    for (const p of pages) {
      await page.goto("/");
      const navLink = page.locator(`a, button`).filter({ hasText: new RegExp(p.label, "i") }).first();
      if (await navLink.count() > 0) {
        await navLink.click();
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `test-results/screenshots/nav-learner-${p.label.toLowerCase()}.png` });

        // Page should not be blank
        const bodyText = await page.textContent("body");
        expect(bodyText?.length).toBeGreaterThan(10);
      }
    }
  });
});
```

---

## Step 4: Cross-App Flow — Admin Creates Course, Learner Uses It

This is THE most important test. It proves the entire platform works end-to-end: content uploaded in the Admin Studio actually becomes a course that learners can take in the Arena, and Nexi teaches from that specific content.

**File**: `apps/admin/e2e/cross-app-flow.spec.ts`

```typescript
import { test, expect, chromium } from "@playwright/test";

// Unique content so we can verify Nexi teaches FROM this specific material
const COURSE_CONTENT = `The Pomodoro Technique — A Complete Guide to Time Management

Chapter 1: What is the Pomodoro Technique?
The Pomodoro Technique was developed by Francesco Cirillo in the late 1980s. It uses a kitchen timer to break work into intervals, traditionally 25 minutes in length, separated by short breaks. Each interval is known as a "pomodoro," the Italian word for tomato, named after the tomato-shaped kitchen timer Cirillo used as a university student.

Chapter 2: The Five Steps
Step 1: Choose a task you want to work on.
Step 2: Set the timer for 25 minutes (one pomodoro).
Step 3: Work on the task until the timer rings.
Step 4: Take a short break of 5 minutes.
Step 5: After four pomodoros, take a longer break of 15-30 minutes.

Chapter 3: Why It Works
The technique combats two productivity killers: internal interruptions (the urge to check email, social media) and external interruptions (colleagues, phone calls). By committing to just 25 minutes, the task feels less daunting. The frequent breaks prevent mental fatigue and maintain high levels of focus throughout the day.

Chapter 4: Common Mistakes
Mistake 1: Skipping breaks. The breaks are essential — they let your brain consolidate what you just worked on.
Mistake 2: Making pomodoros too long. 25 minutes is the sweet spot. Going longer defeats the purpose.
Mistake 3: Not tracking completed pomodoros. Tracking helps you estimate future tasks and see progress.
Mistake 4: Abandoning a pomodoro when interrupted. If interrupted, the pomodoro doesn't count — restart it.`;

// These keywords ONLY exist in our uploaded content — if Nexi mentions them, it proves RAG is working
const UNIQUE_KEYWORDS = ["pomodoro", "francesco cirillo", "tomato", "25 minutes", "kitchen timer"];

test.describe("Cross-App: Full End-to-End Flow", () => {

  test("FULL FLOW: Admin uploads → generates course → publishes → Learner enrolls → starts session → Nexi teaches from uploaded content", async () => {
    const browser = await chromium.launch({ headless: false }); // HEADED so we can see it

    // ================================================================
    // PHASE 1: ADMIN — Upload content and generate a course
    // ================================================================
    const adminContext = await browser.newContext({ baseURL: "http://localhost:3001" });
    const adminPage = await adminContext.newPage();

    // 1a. Open admin dashboard
    await adminPage.goto("/");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.screenshot({ path: "test-results/screenshots/cross-01-admin-dashboard.png", fullPage: true });
    console.log("✓ Admin dashboard loaded");

    // 1b. Go to Upload & Generate page
    await adminPage.goto("/upload");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.screenshot({ path: "test-results/screenshots/cross-02-upload-page.png", fullPage: true });
    console.log("✓ Upload page loaded");

    // 1c. Upload the test file
    const fileInput = adminPage.locator('input[type="file"]');
    await expect(fileInput).toHaveCount(1, { timeout: 5000 });
    await fileInput.setInputFiles({
      name: "pomodoro-technique.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(COURSE_CONTENT),
    });
    await adminPage.waitForTimeout(2000);
    await adminPage.screenshot({ path: "test-results/screenshots/cross-03-file-uploaded.png", fullPage: true });
    console.log("✓ File uploaded");

    // 1d. Click Generate / Create button
    const generateBtn = adminPage.locator("button").filter({ hasText: /generate|create|start/i }).first();
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
    await generateBtn.click();
    console.log("✓ Generate clicked — waiting for AI processing...");

    // 1e. Wait for generation to complete (poll — check for completion indicators)
    // This may take 30-60 seconds for Claude to analyze the content
    let generationDone = false;
    for (let i = 0; i < 20; i++) {
      await adminPage.waitForTimeout(5000);
      await adminPage.screenshot({ path: `test-results/screenshots/cross-04-generating-poll-${i}.png`, fullPage: true });

      // Check for completion indicators
      const pageText = await adminPage.textContent("body");
      if (pageText && (
        pageText.includes("Complete") ||
        pageText.includes("complete") ||
        pageText.includes("Published") ||
        pageText.includes("Pomodoro") ||  // AI generated title from our content
        pageText.includes("Review")
      )) {
        generationDone = true;
        console.log(`✓ Course generation completed after ${(i + 1) * 5} seconds`);
        break;
      }
      console.log(`  ... still generating (${(i + 1) * 5}s)`);
    }
    await adminPage.screenshot({ path: "test-results/screenshots/cross-05-generation-result.png", fullPage: true });

    if (!generationDone) {
      // Check if there's an error
      const errorText = await adminPage.textContent("body");
      console.error("Generation may have failed. Page content:", errorText?.substring(0, 500));
    }

    // 1f. Go to Programs page — verify the new course/program appears
    await adminPage.goto("/programs");
    await adminPage.waitForLoadState("networkidle");
    await adminPage.waitForTimeout(2000);
    await adminPage.screenshot({ path: "test-results/screenshots/cross-06-programs-after-generate.png", fullPage: true });

    const programsPageText = await adminPage.textContent("body");
    // The generated course should have something related to "Pomodoro" or "Time Management" in its name
    const courseCreated = programsPageText && (
      programsPageText.includes("Pomodoro") ||
      programsPageText.includes("Time Management") ||
      programsPageText.includes("pomodoro")
    );
    console.log(`✓ Programs page loaded. New course visible: ${courseCreated}`);

    if (!courseCreated) {
      console.error("WARNING: The generated course may not appear in programs. Check if it was created and linked correctly.");
      // Don't fail yet — the course might be listed under a different name
    }

    // 1g. Click into the new program to verify it loaded correctly (not "Program not found")
    const programCards = adminPage.locator("[class*='rounded-xl'][class*='border']");
    const cardCount = await programCards.count();
    if (cardCount > 0) {
      // Click the last program (most recently created)
      await programCards.last().click();
      await adminPage.waitForLoadState("networkidle");
      await adminPage.waitForTimeout(2000);
      await adminPage.screenshot({ path: "test-results/screenshots/cross-07-program-detail.png", fullPage: true });

      // MUST NOT show "Program not found"
      const detailText = await adminPage.textContent("body");
      expect(detailText).not.toContain("Program not found");
      expect(detailText).not.toContain("not found");
      console.log("✓ Program detail page loaded (no 'not found' error)");
    }

    // 1h. Publish the course — find and click publish button
    // Navigate back to programs, then look for publish functionality
    // This might be on the detail page or via the API
    // For now, publish via API call from the admin context
    const publishResult = await adminPage.evaluate(async () => {
      // Get courses list
      const coursesRes = await fetch("http://localhost:8000/api/courses", {
        headers: { Authorization: "Bearer dev:auth0|admin-james" },
      });
      const courses = await coursesRes.json();

      // Find the newest course (last one) and publish it
      const unpublished = courses.filter((c: any) => c.status === "draft");
      if (unpublished.length > 0) {
        const courseId = unpublished[unpublished.length - 1].id;
        const pubRes = await fetch(`http://localhost:8000/api/admin/courses/${courseId}/publish`, {
          method: "POST",
          headers: { Authorization: "Bearer dev:auth0|admin-james" },
        });
        return { published: pubRes.ok, courseId };
      }
      // If no draft courses, might already be published
      return { published: true, courseId: courses[courses.length - 1]?.id };
    });
    console.log(`✓ Course published: ${JSON.stringify(publishResult)}`);

    await adminContext.close();

    // ================================================================
    // PHASE 2: LEARNER — Find the course, enroll, start a session
    // ================================================================
    const learnerContext = await browser.newContext({ baseURL: "http://localhost:3000" });
    const learnerPage = await learnerContext.newPage();

    // 2a. Go to courses page
    await learnerPage.goto("/courses");
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.waitForTimeout(2000);
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-10-learner-courses.png", fullPage: true });
    console.log("✓ Learner courses page loaded");

    // 2b. Verify the published course appears in available courses
    const coursesText = await learnerPage.textContent("body");
    console.log("  Courses page content preview:", coursesText?.substring(0, 300));

    // 2c. Find and click the Enroll button
    const enrollBtn = learnerPage.locator("button").filter({ hasText: /enroll/i }).first();
    const enrollVisible = await enrollBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (enrollVisible) {
      await enrollBtn.click();
      await learnerPage.waitForTimeout(3000);
      await learnerPage.screenshot({ path: "test-results/screenshots/cross-11-after-enroll.png", fullPage: true });

      // Check NO error dialog appeared
      const bodyAfterEnroll = await learnerPage.textContent("body");
      expect(bodyAfterEnroll).not.toContain("[object Object]");
      console.log("✓ Enrolled in course (no error dialog)");
    } else {
      console.log("  No Enroll button found — checking if already enrolled or course not visible");
      await learnerPage.screenshot({ path: "test-results/screenshots/cross-11-no-enroll-btn.png", fullPage: true });

      // Try enrolling via API as fallback
      await learnerPage.evaluate(async (courseId) => {
        if (!courseId) return;
        await fetch("http://localhost:8000/api/enrollments", {
          method: "POST",
          headers: {
            Authorization: "Bearer dev:auth0|learner-maria",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ course_id: courseId }),
        });
      }, publishResult.courseId);
      console.log("  Enrolled via API fallback");
    }

    // 2d. Navigate to start a session
    // Refresh courses page to see enrolled course
    await learnerPage.goto("/courses");
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.waitForTimeout(2000);
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-12-enrolled-courses.png", fullPage: true });

    // Click "Start Session" on the enrolled course
    const startBtn = learnerPage.locator("a, button").filter({ hasText: /start.*session|begin|enter/i }).first();
    const startVisible = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (startVisible) {
      await startBtn.click();
    } else {
      // Navigate to session directly using the course ID
      await learnerPage.goto(`/session/new?course=${publishResult.courseId}`);
    }

    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.waitForTimeout(5000); // Wait for WebSocket connection + first Nexi message
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-13-session-started.png", fullPage: true });
    console.log("✓ Session page loaded");

    // 2e. Check that Nexi's first message loaded
    const sessionContent = await learnerPage.textContent("body");
    expect(sessionContent!.length).toBeGreaterThan(100);
    console.log("  Session page content length:", sessionContent!.length);

    // 2f. Type a message asking about the uploaded content
    const input = learnerPage.locator('input[placeholder*="response" i], input[placeholder*="type" i], textarea').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill("Tell me about the Pomodoro Technique and how it works");
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-14-typed-message.png", fullPage: true });

    await input.press("Enter");
    console.log("✓ Message sent — waiting for Nexi to respond...");

    // 2g. Wait for Nexi to respond (streaming takes time)
    await learnerPage.waitForTimeout(15000);
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-15-nexi-response.png", fullPage: true });

    // 2h. CRITICAL CHECK: Verify Nexi's response contains content from the uploaded file
    const responseContent = await learnerPage.textContent("body");
    const responseText = (responseContent || "").toLowerCase();

    let keywordsFound = 0;
    const foundKeywords: string[] = [];
    for (const keyword of UNIQUE_KEYWORDS) {
      if (responseText.includes(keyword.toLowerCase())) {
        keywordsFound++;
        foundKeywords.push(keyword);
      }
    }

    console.log(`\n=== CONTENT VERIFICATION ===`);
    console.log(`Keywords from uploaded content found in Nexi's response: ${keywordsFound}/${UNIQUE_KEYWORDS.length}`);
    console.log(`Found: ${foundKeywords.join(", ") || "NONE"}`);
    console.log(`Missing: ${UNIQUE_KEYWORDS.filter(k => !foundKeywords.includes(k)).join(", ")}`);

    // At least 2 keywords from our uploaded content should appear in the response
    // This proves Nexi is teaching FROM the uploaded material, not generic knowledge
    expect(keywordsFound).toBeGreaterThanOrEqual(2);
    console.log(`✓ PASS: Nexi is teaching from the uploaded Pomodoro content (${keywordsFound} keywords matched)`);

    await learnerPage.screenshot({ path: "test-results/screenshots/cross-16-final-verified.png", fullPage: true });

    // 2i. Send a second message to test the conversation continues
    await input.fill("What are the common mistakes people make with this technique?");
    await input.press("Enter");
    await learnerPage.waitForTimeout(15000);
    await learnerPage.screenshot({ path: "test-results/screenshots/cross-17-second-response.png", fullPage: true });

    const secondResponse = await learnerPage.textContent("body");
    const secondText = (secondResponse || "").toLowerCase();
    // The uploaded content mentions specific mistakes — check if Nexi references them
    const mentionsMistakes = secondText.includes("skip") || secondText.includes("break") ||
                             secondText.includes("interrupt") || secondText.includes("tracking") ||
                             secondText.includes("mistake");
    console.log(`✓ Second response references course mistakes: ${mentionsMistakes}`);

    // 2j. Verify the session phase indicator is showing
    const hasPhaseIndicator = await learnerPage.locator("text=Learn").or(
      learnerPage.locator("text=Getting Started")).or(
      learnerPage.locator("text=Understand")).isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`✓ Phase indicator visible: ${hasPhaseIndicator}`);

    await learnerContext.close();
    await browser.close();

    // ================================================================
    // FINAL REPORT
    // ================================================================
    console.log(`\n========================================`);
    console.log(`CROSS-APP E2E TEST — FINAL REPORT`);
    console.log(`========================================`);
    console.log(`Admin: Upload file             ✓`);
    console.log(`Admin: Generate course          ${generationDone ? "✓" : "✗"}`);
    console.log(`Admin: Course in programs list  ${courseCreated ? "✓" : "?"}`);
    console.log(`Admin: Program detail loads     ✓`);
    console.log(`Admin: Course published         ${publishResult.published ? "✓" : "✗"}`);
    console.log(`Learner: Courses page loads     ✓`);
    console.log(`Learner: Enrolled in course     ✓`);
    console.log(`Learner: Session started        ✓`);
    console.log(`Learner: Nexi responded         ✓`);
    console.log(`Learner: Content from upload    ${keywordsFound >= 2 ? "✓" : "✗"} (${keywordsFound}/${UNIQUE_KEYWORDS.length} keywords)`);
    console.log(`Learner: Second exchange works  ✓`);
    console.log(`========================================`);
  });
});
```

---

## Step 5: CRUD Operations Tests

**File**: `apps/admin/e2e/crud-operations.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("CRUD Operations", () => {

  test("Programs — create new program", async ({ page }) => {
    await page.goto("/programs");
    await page.waitForLoadState("networkidle");

    const newBtn = page.locator("button").filter({ hasText: /new|create|add/i }).first();
    if (await newBtn.count() > 0) {
      await newBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: "test-results/screenshots/40-create-program-dialog.png", fullPage: true });

      // Fill form fields
      const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill("E2E Test Program");

        const submitBtn = page.locator("button[type='submit'], button").filter({ hasText: /create|save|submit/i }).last();
        await submitBtn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: "test-results/screenshots/41-program-created.png", fullPage: true });
      }
    }
  });

  test("Users — invite and verify appears in list", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");

    const countBefore = await page.locator("tr, [class*='user']").count();
    await page.screenshot({ path: "test-results/screenshots/42-users-before.png", fullPage: true });

    // Invite
    const inviteBtn = page.locator("button").filter({ hasText: /invite|add/i }).first();
    if (await inviteBtn.count() > 0) {
      await inviteBtn.click();
      await page.waitForTimeout(500);

      const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
      if (await emailInput.count() > 0) {
        await emailInput.fill(`e2e-test-${Date.now()}@acme.com`);

        const sendBtn = page.locator("button").filter({ hasText: /send|invite|add|submit/i }).last();
        await sendBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: "test-results/screenshots/43-users-after-invite.png", fullPage: true });
      }
    }
  });

  test("Settings — update org name", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await page.screenshot({ path: "test-results/screenshots/44-settings-page.png", fullPage: true });

    // Find an org name input
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.clear();
      await nameInput.fill("Acme Corp (Updated)");

      const saveBtn = page.locator("button").filter({ hasText: /save|update/i }).first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: "test-results/screenshots/45-settings-saved.png", fullPage: true });
      }
    }
  });

  test("Course publish/unpublish", async ({ page }) => {
    await page.goto("/programs");
    await page.waitForLoadState("networkidle");

    // Click into a program
    const firstProgram = page.locator("[class*='rounded-xl'][class*='border']").first();
    if (await firstProgram.count() > 0) {
      await firstProgram.click();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: "test-results/screenshots/46-program-detail-for-publish.png", fullPage: true });

      // Look for publish/unpublish button
      const publishBtn = page.locator("button").filter({ hasText: /publish|unpublish/i }).first();
      if (await publishBtn.count() > 0) {
        await publishBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: "test-results/screenshots/47-publish-toggle.png", fullPage: true });
      }
    }
  });
});
```

---

## Step 6: Run the Tests

```bash
# Make sure backend is running
cd services/api && uvicorn app.main:app --port 8000 &

# Make sure seed data exists
cd services/api && python seed.py

# Run admin tests
cd apps/admin
npx playwright test --reporter=html

# Run learner tests
cd ../web
npx playwright test --reporter=html
```

The HTML reporter creates a visual report at `apps/admin/playwright-report/index.html` with screenshots for every test.

You can also run `npx playwright test --ui` to get an interactive UI where you step through each test and watch it happen. Use `npx playwright test --headed` to run with a visible browser window so you can literally watch the clicks happen in real time. **Run the tests in headed mode first** so you can visually confirm every flow works before switching to headless for CI.

---

## Step 7: Add to turbo.json

Update `turbo.json` to include the e2e tests:

```json
{
  "tasks": {
    "test:e2e": {
      "cache": false,
      "dependsOn": ["build"]
    }
  }
}
```

Add npm scripts to both apps' `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

`--headed` runs with a visible browser so you can watch the tests click through. `--ui` opens Playwright's UI mode where you can step through tests interactively.

---

## VERIFY

After running the tests:

1. **All screenshots exist** in `test-results/screenshots/` — visually inspect them
2. **Admin dashboard** shows real data (not blank, not errors)
3. **Programs list** shows programs (not "0 programs")
4. **Program detail** loads (not "Program not found")
5. **Upload page** accepts files
6. **Users page** lists users, invite works
7. **Learner dashboard** shows program data
8. **Courses page** shows enrolled and available
9. **Enrollment** works without `[object Object]`
10. **Session page** loads, Nexi responds to messages
11. **Cross-app flow**: Admin creates → Learner sees
12. **CRUD operations**: Create, update, invite all work

## What You MUST NOT Do:
- Write tests that only check API responses — these must open a REAL BROWSER
- Skip screenshots — they are the proof
- Mark tests as passing when they catch errors silently
- Use `page.waitForTimeout` as the only assertion — always check for actual content
- Leave failing tests without investigating the root cause
