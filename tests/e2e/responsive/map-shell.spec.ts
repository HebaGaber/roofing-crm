// B-01 TZ04 (NFR-002, TC-NF-02; AC-4 breakpoint behaviour): responsive coverage for the signed-in
// Map screen and its roadmap navigation shell at 390/768/1440 px, run via playwright.config.ts's
// three viewport projects against RUNTIME_URL. Covers AppShell.module.css's row->column switch
// at the 600px rail breakpoint and NavRail/MoreSheet's complementary visibility switch at 768px
// (NavRail.module.css, MoreSheet.module.css) — not sign-in or navigation business logic, which
// B-01.spec.ts's AC-1/AC-4/AC-5 cases already cover.
import { expect, test } from "@playwright/test";
import { atlasTokenAudit, AUDITED_PROPERTIES } from "../lib/atlas-tokens.js";

const SEEDED_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
const SEEDED_PASSWORD = process.env.CRM_TEST_PASSWORD; // Never hard-coded (constitution Article XII).

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(SEEDED_USERNAME);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD as string);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.locator('[data-route="map"]')).toBeVisible();
}

test.describe("Responsive design: Map screen and navigation shell", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    await signIn(page);
    await page.evaluate(() => document.fonts.ready);
  });

  test("renders with no horizontal overflow", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("shows the roadmap sections in the surface this breakpoint owns (More sheet below 768px, nav rail from 768px)", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const isCompact = (viewport?.width ?? 0) < 768;

    const moreTrigger = page.getByRole("button", { name: "More" });
    const navRail = page.locator('[aria-label="Roadmap sections (not yet built)"]');

    if (isCompact) {
      await expect(moreTrigger).toBeVisible();
      await expect(navRail).toBeHidden();
    } else {
      await expect(moreTrigger).toBeHidden();
      await expect(navRail).toBeVisible();
    }
  });

  test("the primary nav switches from row (bottom bar) to column (left rail) layout at the rail breakpoint", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const isCompact = (viewport?.width ?? 0) < 600;
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).toHaveCSS("flex-direction", isCompact ? "row" : "column");
  });

  test("the five roadmap rows stay reachable without horizontal scroll", async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const moreTrigger = page.getByRole("button", { name: "More" });
    if (await moreTrigger.isVisible()) {
      await moreTrigger.click();
    }
    const row = page.getByRole("button", { name: /Campaigns/ });
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test("passes the Atlas design-token audit (no non-token color, type, spacing or radius values)", async ({
    page,
  }) => {
    const moreTrigger = page.getByRole("button", { name: "More" });
    if (await moreTrigger.isVisible()) {
      await moreTrigger.click();
    }
    const audit = await page.evaluate(atlasTokenAudit, AUDITED_PROPERTIES);
    expect(audit.checkedElements).toBeGreaterThan(0);
    expect(audit.violations, JSON.stringify(audit.violations, null, 2)).toEqual([]);
  });
});
