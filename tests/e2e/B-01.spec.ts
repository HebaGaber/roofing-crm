// B-01 story Playwright tests (T013-T016, T024-T025), one AC per describe block. Per
// plan.md's Complexity Tracking row on Article XXI: written first and confirmed failing against
// the local Turborepo dev server (no hosted stack exists yet in this phase); re-run against
// RUNTIME_URL by TZ03 once TZ02 deploys. config-guard.spec.ts enforces RUNTIME_URL is never
// localhost for that later run — this file does not special-case localhost itself.
import { expect, test } from "@playwright/test";

const SEEDED_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
const SEEDED_PASSWORD = process.env.CRM_TEST_PASSWORD; // Never hard-coded (constitution Article XII).

async function signIn(page: import("@playwright/test").Page, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(SEEDED_USERNAME);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
}

// AC-1 (TC-001, TC-006, TC-010): private-window sign-in, lands on Map centered on Travis County,
// no self-sign-up link, session survives a reload.
test.describe("AC-1: sign in and land on the Travis County map", () => {
  test("no self-sign-up link anywhere on the sign-in page", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
  });

  test("signing in with the seeded credentials lands on the Map screen", async ({ page }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await expect(page.getByTestId("crm-map")).toBeVisible();
  });

  test("the session survives a reload (stays on the Map screen)", async ({ page }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
    // Wait for sign-in to actually land (the SRP round trip + lockout-gate Lambda take a few
    // seconds) before reloading — found deploying: reloading mid-flight wipes the in-progress
    // sign-in and lands back on /sign-in, which looked like a session-persistence bug but
    // wasn't one; signIn() itself can't wait for this since it's reused by the AC-3 lockout
    // test, which expects wrong-password attempts to never reach the map at all.
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-route="map"]')).toBeVisible();
  });
});

// AC-2 (TC-002): free pan/zoom never drops below the county bbox; health.ping traces within 3s.
test.describe("AC-2: map bounds and health.ping trace", () => {
  test("health.ping responds from the Map screen within 3s of load", async ({ page }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
    const response = await page.waitForResponse(
      (res) => res.url().includes("/api/trpc/health.ping"),
      { timeout: 3000 },
    );
    expect(response.ok()).toBe(true);
  });

  // TD-4 fix: TC-002's pan/zoom claim was previously only unit-tested (bounds.test.ts's pure
  // math), never asserted against the live map. CrmMap.tsx exposes window.__crmMap for exactly
  // this — try to zoom out past the computed minZoom and confirm MapLibre itself clamps it,
  // never actually dropping below full-county visibility.
  test("zooming out never drops below the county's minimum zoom", async ({ page }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await page.waitForFunction(() => {
      const map = (window as unknown as { __crmMap?: { loaded(): boolean } }).__crmMap;
      return map?.loaded() === true;
    });
    const minZoom = await page.evaluate(() =>
      (window as unknown as { __crmMap: { getMinZoom(): number } }).__crmMap.getMinZoom(),
    );
    expect(minZoom).toBeGreaterThan(0);
    const clampedZoom = await page.evaluate(() => {
      const map = (
        window as unknown as { __crmMap: { setZoom(z: number): unknown; getZoom(): number } }
      ).__crmMap;
      map.setZoom(0); // attempt to zoom out far past any sane county-wide minimum
      return map.getZoom();
    });
    expect(clampedZoom).toBeCloseTo(minZoom, 5);
  });
});

// AC-3 (TC-003, TC-004, TC-011): 3 wrong passwords then a 4th locks out with the typed message;
// a successful sign-in after the 5-minute cooldown succeeds.
test.describe("AC-3: typed lockout after the 4th consecutive failed attempt", () => {
  test("the 4th wrong password shows the typed lockout message, never a generic error", async ({
    page,
  }) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await signIn(page, "wrong-password-does-not-match");
      await page.waitForSelector("[data-sign-in-error]");
      // TD-4 fix (TC-004): the first 3 attempts must show the plain invalid-credentials text,
      // distinct from the eventual lockout message — previously only the final (4th) attempt's
      // text was ever asserted, so a bug that showed the lockout message prematurely (e.g. on
      // attempt 2) would have passed unnoticed.
      if (attempt < 3) {
        await expect(page.locator("[data-sign-in-error]")).toHaveText(
          "Incorrect username or password.",
        );
      }
    }
    await expect(page.locator("[data-sign-in-error]")).toHaveText(
      "Too many attempts — try again in 5 minutes.",
    );
  });
});

// Tile-failure edge case (TC-007): a tile-host network abort shows the named CrmMapFailed390
// state with a Retry action, never a blank grey grid.
test.describe("Tile-failure edge case (closes the spec.md gap flagged at G5)", () => {
  test("aborting tile-host requests renders CrmMapFailed390 with a Retry action", async ({
    page,
  }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    if (!SEEDED_PASSWORD) return;
    await page.route("**/demotiles.maplibre.org/**", (route) => route.abort());
    await signIn(page, SEEDED_PASSWORD);
    await expect(page.locator('[data-state="CrmMapFailed390"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});

// AC-4 (TC-005, TC-009): all 5 roadmap rows render aria-disabled with a "Coming soon" tooltip, at
// 1440px and inside the 390px "More" sheet.
test.describe("AC-4: disabled roadmap rows", () => {
  const SECTIONS = ["Campaigns", "Estimates", "Jobs", "Invoices", "Outreach"];

  test("all 5 rows are aria-disabled with a Coming soon tooltip", async ({ page }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
    // Found deploying (same cause as the "survives a reload" fix above): `moreTrigger.isVisible()`
    // is a one-shot synchronous check, not a retrying `expect` — checked before the SRP round
    // trip finishes, it always saw the sign-in page (no "More" button yet) and silently skipped
    // the click, leaving the sheet closed for the rest of the test.
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    const moreTrigger = page.getByRole("button", { name: "More" });
    if (await moreTrigger.isVisible()) {
      await moreTrigger.click();
    }
    for (const section of SECTIONS) {
      const row = page.getByRole("button", { name: new RegExp(section) });
      await expect(row).toHaveAttribute("aria-disabled", "true");
      await expect(row).toHaveAttribute("title", "Coming soon");
    }
  });
});

// AC-5 (TC-008): tapping a disabled row opens a real Coming Soon page with "Back to Map", never
// a 404.
test.describe("AC-5: a disabled row opens Coming Soon, never a 404", () => {
  test('tapping "Campaigns" opens Coming Soon with a working Back to Map action', async ({
    page,
  }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
    // Same fix as AC-4 above: wait for the SRP round trip to actually land before checking for
    // "More" (found deploying).
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    const moreTrigger = page.getByRole("button", { name: "More" });
    if (await moreTrigger.isVisible()) {
      await moreTrigger.click();
    }
    // force: true — the row is deliberately `aria-disabled="true"` (AC-4's own requirement) but
    // must still be clickable (AC-5: tapping it opens Coming Soon, never a 404); Playwright's
    // default actionability check treats aria-disabled as a real disabled state and refuses to
    // click, which found this product's own intentional "disabled-looking but interactive" NavRow
    // pattern rather than an app bug.
    await page.getByRole("button", { name: /Campaigns/ }).click({ force: true });
    await expect(page.locator('[data-route="coming-soon"]')).toBeVisible();
    await page.getByRole("link", { name: "Back to Map" }).click();
    await expect(page.locator('[data-route="map"]')).toBeVisible();
  });
});
