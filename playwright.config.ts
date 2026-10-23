import { defineConfig, devices } from "@playwright/test";
import { assertHostedRuntimeUrl } from "./tests/e2e/lib/runtime-url.js";

// RUNTIME_URL: the Amplify preview for this branch (tasks.md) — never localhost in Phase Z. When
// it IS set, it must be a real hosted URL (constitution Article I "localhost is never evidence",
// config-guard.spec.ts's loopback cases) — validated at config-load time, found running
// config-guard.spec.ts itself: this file previously read RUNTIME_URL raw with no validation at
// all, so an explicit RUNTIME_URL=http://localhost:3000 silently ran against that instead of
// being refused. Pre-deploy (this phase), RUNTIME_URL is simply UNSET and tests run against the
// local Turborepo dev server instead (plan.md's Complexity Tracking row on Article XXI) — that
// case is intentionally exempt from the guard, which is why config-guard.spec.ts's own "unset"
// case doesn't apply to this story's design (disclosed deviation from the copied A-03 test: that
// story has no local-dev-server testing phase, this one does).
const baseURL =
  process.env.RUNTIME_URL === undefined
    ? "http://localhost:5173"
    : assertHostedRuntimeUrl(process.env.RUNTIME_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Found running against the hosted stack: every project (viewport) shares the one real,
  // seeded Cognito admin account — there's no per-project test isolation for a live external
  // auth backend. AC-3's wrong-password spam running concurrently with AC-1/4/5's correct-
  // password sign-ins (the default parallelism across 3 projects) intermittently locked out or
  // raced the other tests. Force strictly sequential execution against RUNTIME_URL; pre-deploy
  // local runs (no RUNTIME_URL) don't share this constraint and keep full parallelism.
  workers: process.env.RUNTIME_URL === undefined ? undefined : 1,
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
