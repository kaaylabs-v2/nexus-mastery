import { test, expect } from "@playwright/test";

test.describe("Responsive Layout", () => {
  test("full sidebar visible at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText("Dashboard");
  });

  test("sidebar hidden at 768px", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");

    const desktopSidebar = page.locator("aside");
    await expect(desktopSidebar).toBeHidden();
  });
});
