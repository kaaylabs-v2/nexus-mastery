import { test, expect } from "@playwright/test";

test.describe("Arena Session", () => {
  test("renders scenario and chat", async ({ page }) => {
    await page.goto("/session/session-1");

    // Left panel shows course info or mock scenario
    await expect(page.getByText("Session Phases")).toBeVisible();
    await expect(page.getByText("Learn").first()).toBeVisible();
    await expect(page.getByPlaceholder("Reply to Nexi...")).toBeVisible();
  });

  test("scaffold starts collapsed and can be opened", async ({ page }) => {
    await page.goto("/session/session-1");

    // Scaffold closed by default
    await expect(page.locator("text=Thinking Scaffold")).not.toBeVisible();

    // Open it
    await page.locator('button[title="Open Thinking Scaffold"]').click();
    await expect(page.locator("text=Thinking Scaffold")).toBeVisible();
    await expect(page.locator("text=AI Observation")).toBeVisible();
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
