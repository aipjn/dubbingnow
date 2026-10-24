import { defineConfig, devices } from "@playwright/test";
const production = process.env.PLAYWRIGHT_PRODUCTION === "true";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: production ? "npm start" : "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !production && !process.env.CI,
    timeout: 60_000,
  },
});
