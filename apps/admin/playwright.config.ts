import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 300000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3001",
    screenshot: "on",
    trace: "on-first-retry",
    launchOptions: { slowMo: 1500 },
  },
  webServer: {
    command: "npx next dev -p 3001",
    port: 3001,
    reuseExistingServer: true,
    timeout: 30000,
  },
  outputDir: "./test-results",
});
