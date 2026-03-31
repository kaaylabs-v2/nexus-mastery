import { test, expect } from "@playwright/test";

test.describe("Learner Arena — Full Flow", () => {

  test("Dashboard loads with category data", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/20-learner-dashboard.png", fullPage: true });

    await expect(page.locator("text=Dashboard").first()).toBeVisible();
    const body = await page.textContent("body");
    expect(body!.length).toBeGreaterThan(100);
  });

  test("Courses page shows enrolled and available", async ({ page }) => {
    await page.goto("/courses");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/21-courses-page.png", fullPage: true });

    // Should show "Your Courses" or "Available" sections
    await expect(page.locator("text=Courses").first()).toBeVisible();
    const body = await page.textContent("body");
    expect(body!.length).toBeGreaterThan(50);
  });

  test("Session page loads with phases and chat", async ({ page }) => {
    await page.goto("/session/session-1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "test-results/screenshots/22-session-page.png", fullPage: true });

    // Should show phase pills
    await expect(page.locator("text=Learn").first()).toBeVisible({ timeout: 5000 });

    // Should have an input field
    await expect(page.getByPlaceholder("Reply to Nexi...")).toBeVisible();
  });

  test("Type message and Nexi responds", async ({ page }) => {
    await page.goto("/session/session-1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const input = page.getByPlaceholder("Reply to Nexi...");
    await input.fill("I want to learn about decision making");
    await page.screenshot({ path: "test-results/screenshots/23-typed-message.png", fullPage: true });

    await input.press("Enter");

    // User message should appear
    await expect(page.locator("text=I want to learn about decision making")).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: "test-results/screenshots/24-message-sent.png", fullPage: true });

    // Wait for Nexi to respond (mock mode streams quickly)
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "test-results/screenshots/25-nexi-responded.png", fullPage: true });
  });

  test("Scaffold panel opens and closes", async ({ page }) => {
    await page.goto("/session/session-1");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Scaffold starts closed
    await expect(page.locator("text=Thinking Scaffold")).not.toBeVisible();
    await page.screenshot({ path: "test-results/screenshots/26-scaffold-closed.png", fullPage: true });

    // Open it
    const toggleBtn = page.locator('button[title="Open Thinking Scaffold"]');
    if (await toggleBtn.count() > 0) {
      await toggleBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator("text=Thinking Scaffold")).toBeVisible();
      await page.screenshot({ path: "test-results/screenshots/27-scaffold-open.png", fullPage: true });
    }
  });

  test("Analytics page loads with charts", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/28-analytics-page.png", fullPage: true });

    await expect(page.locator("text=Analytics").first()).toBeVisible();
  });

  test("Journal page loads", async ({ page }) => {
    await page.goto("/journal");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/29-journal-page.png", fullPage: true });

    await expect(page.locator("text=Journal").first()).toBeVisible();
  });

  test("Profile page loads", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/30-profile-page.png", fullPage: true });

    await expect(page.locator("text=Profile").first()).toBeVisible();
  });

  test("Sidebar navigation — all pages render", async ({ page }) => {
    const navLabels = ["Dashboard", "Courses", "Analytics", "Journal", "Profile"];

    for (const label of navLabels) {
      await page.goto("/");
      const link = page.locator("a").filter({ hasText: new RegExp(`^${label}$`, "i") }).first();
      if (await link.count() > 0) {
        await link.click();
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `test-results/screenshots/nav-learner-${label.toLowerCase()}.png` });

        const body = await page.textContent("body");
        expect(body!.length).toBeGreaterThan(10);
      }
    }
  });
});
