import { defineConfig, devices } from "@playwright/test";

// RUNTIME_URL: the Amplify preview for this branch (tasks.md) — never localhost in Phase Z
// (config-guard.spec.ts enforces this against RUNTIME_URL). Pre-deploy (this phase), tests run
// against the local Turborepo dev server instead (plan.md's Complexity Tracking row on
// Article XXI), so they can be written first and confirmed failing before any hosted URL exists.
const baseURL = process.env.RUNTIME_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL,
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-390", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "tablet-768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
