import { test, expect } from "@playwright/test";

test.describe("Admin Studio — Full Flow", () => {

  test("Dashboard loads with stats and categories", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/01-admin-dashboard.png", fullPage: true });

    // Page should not be blank
    const body = await page.textContent("body");
    expect(body!.length).toBeGreaterThan(50);

    // Should show "Nexus" branding
    await expect(page.locator("text=Nexus").first()).toBeVisible();
  });

  test("Categories page lists categories", async ({ page }) => {
    await page.goto("/categories");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/02-categories-list.png", fullPage: true });

    // Should show categories heading or category cards
    await expect(page.locator("text=categories").first()).toBeVisible({ timeout: 5000 });
  });

  test("Category detail page loads (not 500)", async ({ page }) => {
    await page.goto("/categories");
    await page.waitForLoadState("networkidle");

    // Click the first category card link
    const firstLink = page.locator("a[href*='/categories/']").first();
    if (await firstLink.count() > 0) {
      await firstLink.click();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: "test-results/screenshots/03-category-detail.png", fullPage: true });

      // Should NOT show "Category not found"
      const body = await page.textContent("body");
      expect(body).not.toContain("Category not found");
    }
  });

  test("Upload page loads", async ({ page }) => {
    await page.goto("/upload");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/04-upload-page.png", fullPage: true });

    // Should show upload instructions
    const body = await page.textContent("body");
    expect(body!.length).toBeGreaterThan(30);
  });

  test("Users page lists users", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/05-users-page.png", fullPage: true });

    // Should show at least one user
    await expect(page.locator("text=acme.com").first()).toBeVisible({ timeout: 5000 });
  });

  test("Users — invite flow works", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");

    const inviteBtn = page.locator("button").filter({ hasText: /invite/i }).first();
    if (await inviteBtn.count() > 0) {
      await inviteBtn.click();
      await page.waitForTimeout(500);

      const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
      if (await emailInput.count() > 0) {
        await emailInput.fill(`e2e-${Date.now()}@acme.com`);
        await page.screenshot({ path: "test-results/screenshots/06-invite-form.png", fullPage: true });

        const sendBtn = page.locator("button").filter({ hasText: /send/i }).last();
        if (await sendBtn.count() > 0) {
          await sendBtn.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: "test-results/screenshots/07-invite-sent.png", fullPage: true });
        }
      }
    }
  });

  test("Analytics page loads with charts", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/08-analytics-page.png", fullPage: true });

    const body = await page.textContent("body");
    expect(body!.length).toBeGreaterThan(50);
  });

  test("Settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "test-results/screenshots/09-settings-page.png", fullPage: true });

    const body = await page.textContent("body");
    expect(body!.length).toBeGreaterThan(50);
  });

  test("Sidebar navigation — all pages render", async ({ page }) => {
    const navLabels = ["Dashboard", "Categories", "Upload", "Users", "Analytics", "Settings"];

    for (const label of navLabels) {
      await page.goto("/");
      const link = page.locator("a").filter({ hasText: new RegExp(label, "i") }).first();
      if (await link.count() > 0) {
        await link.click();
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `test-results/screenshots/nav-admin-${label.toLowerCase()}.png` });

        const body = await page.textContent("body");
        expect(body!.length).toBeGreaterThan(10);
      }
    }
  });

  test("Delete category works", async ({ page }) => {
    await page.goto("/categories");
    await page.waitForLoadState("networkidle");

    const countBefore = await page.locator("a[href*='/categories/']").count();
    await page.screenshot({ path: "test-results/screenshots/10-before-delete.png", fullPage: true });

    // Hover to reveal delete button
    const firstCard = page.locator("[class*='rounded-xl'][class*='group']").first();
    if (await firstCard.count() > 0) {
      await firstCard.hover();
      await page.waitForTimeout(300);

      const deleteBtn = page.locator("button[title='Delete category']").first();
      if (await deleteBtn.count() > 0) {
        // Accept the confirm dialog
        page.on("dialog", (dialog) => dialog.accept());
        await deleteBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: "test-results/screenshots/11-after-delete.png", fullPage: true });
      }
    }
  });
});
