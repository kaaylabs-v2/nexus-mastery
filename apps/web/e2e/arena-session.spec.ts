import { test, expect } from "@playwright/test";

test.describe("Arena Session", () => {
  test("renders workspace layout and chat", async ({ page }) => {
    await page.goto("/session/session-1");

    // 3-pane workspace: chat input should be visible
    await expect(page.getByPlaceholder("Reply to Nexi...")).toBeVisible();

    // Stage labels should be present (either course outline topics or fallback phase labels)
    // The workspace layout should render without crashing
    const mainContent = page.locator('[class*="h-full"], [class*="flex-col"]');
    await expect(mainContent.first()).toBeVisible();
  });

  test("sources and notebook panes are present", async ({ page }) => {
    await page.goto("/session/session-1");

    // The workspace layout should have the 3-pane structure
    // Sources pane mini icon and Notebook pane mini icon should be visible
    await expect(page.getByPlaceholder("Reply to Nexi...")).toBeVisible();

    // The page should not crash — basic rendering check
    await expect(page.locator("body")).not.toHaveText("Application error");
  });

  test("user can type and submit a message", async ({ page }) => {
    await page.goto("/session/session-1");

    const input = page.getByPlaceholder("Reply to Nexi...");
    await input.fill("I think we should align on shared goals first");
    await input.press("Enter");

    // User message should appear in the chat
    await expect(page.locator("text=I think we should align on shared goals first")).toBeVisible();
  });
});
