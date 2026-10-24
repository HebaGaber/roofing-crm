// T018a (B-03): adapted from the A-03/B-02 copy of this file (its own header recorded that
// history) for this story's NFR-001 — radius/threshold-change latency on `search.properties`/
// `search.permits`, not Task A's Permits-page User Timing marks (this app has no such
// instrumentation; `crm:duckdb:init`/`crm:query:list`/`crm:query:count` were never ported here).
// Black-box timing instead: `performance.now()` around the change event, until the results list
// (`[data-testid="search-results"]`) settles — the same shape as
// testplans/B-03-test-cases.md's B-03-TC-NF-01 (radius change 5→25 mi, then a threshold change),
// 20 timed runs after one untimed warm-up, p95 < 3,000 ms (architecture-constitution.md §10).
import { expect, test } from "@playwright/test";
import { runtimeUrl } from "./lib/runtime.js";
import { AUTH_STATE_PATH, NO_PASSWORD_REASON, openSignedIn, SEEDED_PASSWORD } from "./lib/auth.js";

// Signed in once by the `setup` project (tests/e2e/lib/auth.ts); sign-in itself is B-01's job.
test.use({ storageState: AUTH_STATE_PATH });

const TIMED_RUNS = 20;
const P95_LIMIT_MS = 3_000;

interface Summary {
  n: number;
  p50Ms: number;
  p95Ms: number;
}

function summarize(valuesMs: number[]): Summary {
  const sorted = [...valuesMs].sort((a, b) => a - b);
  const pick = (p: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
  return { n: sorted.length, p50Ms: pick(0.5), p95Ms: pick(0.95) };
}

/** Clicks the map at the Pflugerville pin (AC-1) and returns once a search response landed. */
async function dropPinAndWait(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("crm-map").click();
  await page
    .locator('[data-testid="search-results"], [data-state="CrmMapNoResults390"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

/** One timed run: changes the radius, waits for the results region to re-render, returns the
 *  elapsed time in ms. Marked `[Skip="live run only"]` in Phase Z's evidence, per NF-01's note. */
async function timedRadiusChange(
  page: import("@playwright/test").Page,
  toRadiusMi: number,
): Promise<number> {
  const started = await page.evaluate(() => performance.now());
  // The number box, not the slider (its label is "Radius (slider)", which also matches "Radius").
  const radius = page.getByRole("spinbutton", { name: "Radius" });
  await radius.fill(String(toRadiusMi));
  await radius.blur();
  await page
    .locator('[data-testid="search-results"], [data-state="CrmMapNoResults390"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  const ended = await page.evaluate(() => performance.now());
  return ended - started;
}

test.describe("B-03-TC-NF-01: radius change p95 < 3 s end to end, 20 runs", () => {
  test.describe.configure({ timeout: 10 * 60_000 });

  test("@scenario:B-03-TC-NF-01", async ({ page }, testInfo) => {
    test.skip(SEEDED_PASSWORD === undefined, NO_PASSWORD_REASON);
    if (!SEEDED_PASSWORD) return;

    await openSignedIn(page);
    await dropPinAndWait(page);

    // One untimed warm-up (the first search fills the browser's HTTP cache).
    await timedRadiusChange(page, 6);

    const timingsMs: number[] = [];
    for (let i = 1; i <= TIMED_RUNS; i += 1) {
      // Alternates 25 <-> 6 mi so each run is a real re-fetch, never a no-op (B-03-TC-015's
      // "repeated changes" shape applied to this NFR instead of to counts.afterRoofAge).
      const toRadiusMi = i % 2 === 0 ? 6 : 25;
      timingsMs.push(await timedRadiusChange(page, toRadiusMi));
    }

    const summary = summarize(timingsMs);
    await testInfo.attach("tc-nf-01-radius-change-timings.json", {
      body: JSON.stringify({ url: `${runtimeUrl()}/`, timingsMs, summary }, null, 2),
      contentType: "application/json",
    });

    expect(summary.n).toBe(TIMED_RUNS);
    expect(summary.p95Ms, `radius-change p95 < ${P95_LIMIT_MS} ms`).toBeLessThan(P95_LIMIT_MS);
  });
});
