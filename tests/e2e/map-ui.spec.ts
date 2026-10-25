// Focused hosted checks for the map's list and overlay behaviour (collapsed result rows, the
// numbered pager, the Layers dialog with its Legend switch, hexagon cells). Layout of the docked
// split is in responsive/layout.spec.ts. Read-only browsing as the seeded admin with the saved
// session; nothing is created. One project (desktop-1440) is enough: the viewport is set per case
// where a width matters.
import { expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, NO_PASSWORD_REASON, SEEDED_PASSWORD } from "./lib/auth.js";
import { LAYOUT_SEARCH_PATH } from "./lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

const row = (page: Page) => page.locator("[data-result-row]");

async function openSearch(page: Page, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(LAYOUT_SEARCH_PATH);
  await expect(page.locator('[data-route="map"]')).toBeVisible();
  await expect(row(page).first()).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("Map: results list, Layers and hexagons", () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(async ({}, testInfo) => {
    test.skip(SEEDED_PASSWORD === undefined, NO_PASSWORD_REASON);
    test.skip(testInfo.project.name !== "desktop-1440", "viewport is set per case; run once");
  });

  test("a result row is collapsed by default and expands and collapses", async ({ page }) => {
    await openSearch(page);
    const first = row(page).first();
    await expect(first).toHaveAttribute("data-expanded", "false");
    // The collapsed row keeps the way into the drawer and offers the chevron.
    await expect(first.getByRole("button", { name: "Open details" })).toBeVisible();
    const collapsedHeight = (await first.boundingBox())?.height ?? 0;
    expect(collapsedHeight, "the collapsed row has a box").toBeGreaterThan(0);

    await first.getByRole("button", { name: "Expand details" }).click();
    await expect(first).toHaveAttribute("data-expanded", "true");
    await expect(first.getByRole("button", { name: "Collapse details" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const expandedHeight = (await first.boundingBox())?.height ?? 0;
    expect(expandedHeight, "the expanded row shows more").toBeGreaterThan(collapsedHeight);

    await first.getByRole("button", { name: "Collapse details" }).click();
    await expect(first).toHaveAttribute("data-expanded", "false");
  });

  test("the pager moves to the next page of ten rows and back", async ({ page }) => {
    await openSearch(page);
    const showing = page.getByText(/^Showing 1.10 of /);
    await expect(showing).toBeVisible();
    await expect(row(page)).toHaveCount(10);
    const firstCid = await row(page).first().getAttribute("data-property-cid");

    const pages = page.getByRole("navigation", { name: "Pages" });
    await expect(pages.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await pages.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText(/^Showing 11.20 of /)).toBeVisible();
    await expect(pages.getByRole("button", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await row(page).first().getAttribute("data-property-cid")).not.toBe(firstCid);

    await pages.getByRole("button", { name: "Previous page" }).click();
    await expect(showing).toBeVisible();
    expect(await row(page).first().getAttribute("data-property-cid")).toBe(firstCid);
  });

  test("the Layers dialog holds the Legend switch; there is no separate Legend button", async ({
    page,
  }) => {
    await openSearch(page);
    const legend = page.getByRole("region", { name: "Map legend" });
    // Open by default from 600 px; its own close button is "Close legend".
    await expect(legend).toBeVisible();
    await expect(page.getByRole("button", { name: "Legend", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Layers", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Layers" });
    await expect(dialog).toBeVisible();
    const toggle = dialog.getByRole("checkbox", { name: /^Legend/ });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(legend).toBeHidden();
    await toggle.check();
    await expect(legend).toBeVisible();
    await page.keyboard.press("Escape");

    await legend.getByRole("button", { name: "Close legend" }).click();
    await expect(legend).toBeHidden();
  });

  test("a hexagon cell in the county overview starts a search there (lat, lng and r in the URL)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    const cell = page.locator("[data-hex-cell]").first();
    await expect(cell, "the county overview lists hexagon cells").toBeAttached({ timeout: 30_000 });
    // The cells are the keyboard twin of the hexagon layer (visually hidden, named "Hexagon, ..."),
    // so they are activated with the keyboard: focus, then Enter.
    await expect(cell).toHaveAttribute("aria-label", /^Hexagon, /);
    const searched = async (): Promise<boolean> => {
      await cell.focus();
      await page.keyboard.press("Enter");
      try {
        await expect(page).toHaveURL(/lat=.*lng=.*r=|lng=.*lat=.*r=/, { timeout: 5_000 });
        return true;
      } catch {
        return false;
      }
    };
    // One retry, on purpose: the very first activation after the overview paints was seen to be
    // dropped once locally (the map re-rendered its cells under the focused one). A second
    // failure is a real failure.
    if (!(await searched())) expect(await searched(), "hexagon search after one retry").toBe(true);
    const url = new URL(page.url());
    for (const key of ["lat", "lng", "r"]) {
      expect(Number(url.searchParams.get(key)), `URL param ${key}`).not.toBeNaN();
    }
    await expect(
      page.locator('[data-route="map"] [data-result-row], [data-state^="CrmMap"]').first(),
    ).toBeAttached({
      timeout: 60_000,
    });
  });
});
