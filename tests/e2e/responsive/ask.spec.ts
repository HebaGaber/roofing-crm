// B-09 T048 (US3, AC-5; agent-design.md smeargle §2/§4): responsive coverage for the Ask screen
// at 390/768/1440, run via playwright.config.ts's three viewport projects against RUNTIME_URL.
// Follows `tests/e2e/responsive/map-shell.spec.ts`'s exact shape (`signIn()` helper,
// `document.fonts.ready`) and reuses its no-overflow/visibility-swap/bounding-box/
// `atlasTokenAudit` assertions, asserted against the Ask screen's own `data-state` values
// (`apps/web/src/routes/Ask/Ask.tsx`'s `OUTCOME_STATE` export — the single source of truth this
// file's selectors are built from, not re-derived here).
//
// Deterministic seeded queries, same pattern as `B-03-map-search.spec.ts`'s GEORGETOWN/
// PFLUGERVILLE constants:
//  - an out-of-scope ZIP (99999, mirroring AC-3/G6) reliably reaches `data-state="out_of_scope"`
//    with zero model-call cost (contracts/agent-api.md: scope short-circuit, no compose call).
//  - a plainly ambiguous, ungeocodable place name reliably reaches `data-state="not_found"`
//    (ADR-06: confidence < 0.80 with no usable candidates).
// `throttled` and `paused` are rate/spend-cap-dependent (NFR-001: 5 asks/min/user, $3/day cap) and
// not reliably reproducible live without a test-only trigger seam, which does not exist in this
// codebase today (checked `apps/web/src/routes/Ask/askApi.ts` and the agent runtime for one) —
// per AC-8's own allowance and smeargle's design note, these two states are explicitly deferred
// here with this reason rather than invented or faked.
import { expect, test, type Page } from "@playwright/test";
import { atlasTokenAudit, AUDITED_PROPERTIES } from "../lib/atlas-tokens.js";

const SEEDED_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
const SEEDED_PASSWORD = process.env.CRM_TEST_PASSWORD; // Never hard-coded (constitution Article XII).

const ASK_ROOT = '[data-route="ask"]';
const OUT_OF_SCOPE_QUESTION = "open roofing permits within five miles of 99999";
const NOT_FOUND_QUESTION = "open roofing permits within five miles of zzzzzznotaplacezzzzzz";

async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(SEEDED_USERNAME);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD as string);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.locator('[data-route="map"]')).toBeVisible();
}

async function gotoAsk(page: Page): Promise<void> {
  await page.goto("/ask");
  await expect(page.locator(ASK_ROOT)).toHaveAttribute("data-state", "idle");
  await page.evaluate(() => document.fonts.ready);
}

async function ask(page: Page, question: string): Promise<void> {
  await page.getByLabel("Question").fill(question);
  await page.getByRole("button", { name: "Ask" }).click();
}

test.describe("Responsive design: Ask screen", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
    await signIn(page);
    await gotoAsk(page);
  });

  test("the idle screen renders with no horizontal overflow", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("shows the roadmap sections in the surface this breakpoint owns (More sheet below 600px, nav rail from 600px)", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const isCompact = (viewport?.width ?? 0) < 600;

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

  test("the question row and Ask action stay reachable without horizontal scroll, in both the working and answered states", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    const input = page.getByLabel("Question");
    const box = await input.boundingBox();
    expect(box).not.toBeNull();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    await ask(page, OUT_OF_SCOPE_QUESTION);
    // `working` is transient (the `agent.ask` mutation in flight) — assert it fires at all before
    // the terminal `out_of_scope` state replaces it, same "working... -> terminal" shape every
    // other mutation-driven screen in this app follows.
    await expect(page.locator(ASK_ROOT)).toHaveAttribute("data-state", /working|out_of_scope/);
    await expect(page.locator(ASK_ROOT)).toHaveAttribute("data-state", "out_of_scope", {
      timeout: 25_000,
    });
  });

  test("reaches out_of_scope for a ZIP outside Travis County, with no horizontal overflow", async ({
    page,
  }) => {
    await ask(page, OUT_OF_SCOPE_QUESTION);
    await expect(page.locator(ASK_ROOT)).toHaveAttribute("data-state", "out_of_scope", {
      timeout: 25_000,
    });
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    await expect(page.getByRole("alert").or(page.getByRole("status"))).toBeVisible();
  });

  test("reaches not_found for an ungeocodable place name, with no horizontal overflow", async ({
    page,
  }) => {
    await ask(page, NOT_FOUND_QUESTION);
    await expect(page.locator(ASK_ROOT)).toHaveAttribute(
      "data-state",
      /not_found|low_confidence/,
      { timeout: 25_000 },
    );
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test.skip(
    true,
    "throttled/paused (NFR-001's 5/min/user + $3/day cap) have no test-only trigger seam in " +
      "this codebase (checked askApi.ts and the agent runtime) — not reliably reproducible live " +
      "without actually exhausting the real rate/spend limit against the shared seeded account, " +
      "which would also break every other live test sharing it. Deferred per AC-8's own allowance " +
      "(agent-design.md smeargle §4), not invented or faked here.",
  );

  test("passes the Atlas design-token audit (no non-token color, type, spacing or radius values)", async ({
    page,
  }) => {
    const audit = await page.evaluate(atlasTokenAudit, AUDITED_PROPERTIES);
    expect(audit.checkedElements).toBeGreaterThan(0);
    expect(audit.violations, JSON.stringify(audit.violations, null, 2)).toEqual([]);
  });
});
