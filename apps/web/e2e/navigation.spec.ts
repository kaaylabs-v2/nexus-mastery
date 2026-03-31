import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("all sidebar links render pages correctly", async ({ page }) => {
    const routes = [
      { path: "/", text: "Dashboard" },
      { path: "/analytics", text: "Analytics" },
      { path: "/journal", text: "Journal" },
      { path: "/profile", text: "Profile" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator("body")).toContainText(route.text);
    }
  });

  test("sidebar highlights active item", async ({ page }) => {
    await page.goto("/");
    const dashboardLink = page.locator('a[href="/"]').filter({ hasText: "Dashboard" });
    await expect(dashboardLink).toHaveClass(/bg-sidebar-accent/);
  });

  test("sidebar shows user info", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("aside")).toContainText("Maria Chen");
    await expect(page.locator("aside")).toContainText("Product Manager");
  });
});
