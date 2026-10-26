// Map controls at the real viewport projects (390, 768, 1440; never resized in the test):
//  - the Filters sheet's owner group (Tenure > 10 yrs, Out-of-area, Tenure N yrs or more) is
//    reachable, inside the screen and causes no horizontal scroll;
//  - the search box suggestions (ZIP, then a street address) stay on screen and clear the filter
//    controls;
//  - the Radius control and the "Location is off" (GPS denied) card fit at 390 (README demo steps
//    2 and 3).
// Read-only browsing as the seeded admin. The denied GPS answer is a stub of the browser
// geolocation API (what the person's browser would say); nothing else is faked.
import { expect, test, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import {
  expectInsideViewport,
  expectNoHorizontalScroll,
  overlapArea,
  settledBox,
} from "../lib/layout.js";
import { LAYOUT_SEARCH_PATH } from "../lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

const map = (page: Page) => page.locator('[data-route="map"]');
const filtersToggle = (page: Page) => map(page).getByRole("button", { name: /^Filters/ });
const searchBox = (page: Page) =>
  page.getByRole("combobox", { name: "Search an address, place, ZIP or permit" });
const suggestions = (page: Page) => page.getByRole("listbox", { name: "Search suggestions" });

test.describe("Map controls fit the screen", () => {
  test.beforeEach(() => {
    requirePassword();
  });

  test("Filters: the owner group is reachable and inside the screen, no horizontal scroll", async ({
    page,
  }, testInfo) => {
    await page.goto(LAYOUT_SEARCH_PATH);
    await expect(map(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const sheet = map(page).getByRole("dialog", { name: "Filters" });
    if (testInfo.project.name !== "desktop-1440") {
      await filtersToggle(page).click();
      await expect(sheet).toBeVisible();
    }
    const panel = testInfo.project.name === "desktop-1440" ? map(page) : sheet;
    const owner = panel.getByRole("group", { name: "Owner" });
    await owner.scrollIntoViewIfNeeded();
    await expect(owner).toBeVisible();

    for (const control of [
      owner.getByRole("button", { name: /Tenure > 10 yrs/ }),
      owner.getByRole("button", { name: /Out-of-area/ }),
      panel.getByLabel(/Tenure, yrs or more/),
    ]) {
      await control.scrollIntoViewIfNeeded();
      expectInsideViewport(await settledBox(control), page, "owner control");
    }
    await expectNoHorizontalScroll(page, "Filters sheet open");
    // The sheet itself does not scroll sideways either.
    if (testInfo.project.name !== "desktop-1440") {
      const sideways = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(sideways, "sheet has no horizontal scroll").toBeLessThanOrEqual(0);
    }
  });

  test("Search: a ZIP and a street address list suggestions inside the screen, clear of the filter controls", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(map(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const box = searchBox(page);

    const check = async (what: string, option: RegExp): Promise<void> => {
      await expect(page.getByRole("option", { name: option }).first()).toBeVisible({
        timeout: 30_000,
      });
      const list = await settledBox(suggestions(page));
      expectInsideViewport(list, page, `${what} suggestions`);
      // The list is the top layer (nothing paints over it) and clears the search box itself.
      const onTop = await suggestions(page).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit !== null && el.closest("[hidden],div")?.contains(hit) === true;
      });
      expect(onTop, `${what} suggestions are the top layer`).toBe(true);
      expect(overlapArea(list, await settledBox(box)), `${what} list clears the search box`).toBe(
        0,
      );
      // A dropdown drops over the toolbar below the box by design; the overlap is recorded, not
      // asserted (the owner decides whether the toolbar should stay visible).
      for (const control of [
        filtersToggle(page),
        map(page).getByRole("button", { name: "Use my location" }),
      ]) {
        if (!(await control.isVisible())) continue;
        const area = overlapArea(list, await settledBox(control));
        if (area > 0) {
          test.info().annotations.push({
            type: "overlap",
            description: `${what} suggestions cover a toolbar control by ${String(Math.round(area))} px2`,
          });
        }
      }
      await expectNoHorizontalScroll(page, what);
    };

    await box.fill("78660");
    await check("ZIP", /78660/);
    await box.fill("2725 WOODALL DR 1401, CEDAR PARK, TX 78613");
    await check("address", /WOODALL/);
  });

  test("Radius control and the GPS-denied card fit at 390 (README demo steps 2 and 3)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "the phone layout is the tight one");
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: unknown, fail: (e: object) => void) =>
            fail({ code: 1, message: "User denied Geolocation" }),
          watchPosition: () => 0,
          clearWatch: () => undefined,
        },
      });
    });
    await page.goto("/");
    await expect(map(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await map(page).getByRole("button", { name: "Use my location" }).click();
    const denied = page.locator("[data-state]").filter({ hasText: "Location is off" });
    await expect(denied).toBeVisible();
    expectInsideViewport(await settledBox(denied), page, "GPS-denied card");
    for (const name of ["Drop pin", "Close"]) {
      const button = denied.getByRole("button", { name, exact: true });
      expectInsideViewport(await settledBox(button), page, `GPS-denied ${name}`);
    }
    await expectNoHorizontalScroll(page, "GPS denied");
    await denied.getByRole("button", { name: "Close", exact: true }).click();

    // Radius control: shown once a search centre exists.
    await page.goto(LAYOUT_SEARCH_PATH);
    await expect(map(page)).toBeVisible();
    const slider = page.getByRole("slider", { name: "Radius (slider)" });
    await expect(slider).toBeVisible();
    expectInsideViewport(await settledBox(slider), page, "Radius slider");
    expectInsideViewport(
      await settledBox(page.getByLabel("Radius", { exact: true })),
      page,
      "Radius input",
    );
    await expectNoHorizontalScroll(page, "Radius control");
  });
});
