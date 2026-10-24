// B-07 (create, manage and browse CRM leads): Playwright cases for testplans/B-07-test-cases.md
// §7, one test per row, titled exactly as the matrix. Runs only against the hosted RUNTIME_URL
// (playwright.config.ts enforces it; localhost is never evidence) with workers=1.
//
// The cases share state on purpose, in file order: TC-001 creates the lead for P_5_52, TC-003 to
// TC-010 work on it, TC-007 creates P_AGE48, TC-011 adds P_5_89. A lead cannot be created twice
// (that is what AC-2 tests), so `beforeAll` first deletes the three test leads from `crm-leads`
// (tests/e2e/lib/leads-cleanup.ts, GAP-3) and `afterAll` does it again only when CRM_E2E_CLEANUP=1.
// That helper needs AWS credentials in the default chain; nothing here prints or stores them.
//
// Request identifiers are read from the live index (`property.get`), never typed by hand. The
// tRPC calls made directly (property.get, leads.list, leads.create) use the app's own call shape
// from packages/api-client (same-origin /api/trpc, no transformer, `Authorization: Bearer` with
// the Cognito ID token that the signed-in page keeps in localStorage `crm.session`).
//
// Not covered live, by design (see the fixme titles): TC-002 (no "Create lead" on a permit row),
// TC-014/TC-015 (GAP-5, needs a second published run), TC-NF-03 (GAP-1, needs 50+ leads).
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIResponse, type Locator, type Page } from "@playwright/test";
import { atlasTokenAudit, AUDITED_PROPERTIES } from "./lib/atlas-tokens.js";
import { EVIDENCE_IMG_DIR } from "./lib/evidence.js";
import { createLeadsCleanup, type LeadsCleanup } from "./lib/leads-cleanup.js";

const SEEDED_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
const SEEDED_PASSWORD = process.env.CRM_TEST_PASSWORD; // Never hard-coded (constitution Article XII).
const CLEANUP_AFTER = process.env.CRM_E2E_CLEANUP === "1";

// testplans/B-07-test-cases.md § 5 (real records, confirmed live).
const P_5_52 = "baguqeera6sd3t5tdfy7xzfaycmcggimk6nzqv7prlcwvbqebohurx37cnpha";
const P_AGE48 = "baguqeerakmixkpatzw4wbiqtxcqbewecmgrzcw3j4vcm3skbe7zofycy5daq";
const P_5_89 = "baguqeeraowktgtrrqrvysxggav2z6sxl5jzy4y5ql43c4ye5mivxphj7p3na";
const MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const TRAVIS_FIPS = "48453";
const ROUND_ROCK = { lat: 30.5083, lng: -97.6789 };
/** Prefix for every note this suite writes, so one run can be told apart from another. */
const RUN_TAG = `B07-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-`;

const leadKeyFor = (requestIdentifier: string): string =>
  `${TRAVIS_FIPS}:tcad:${requestIdentifier}`;
const leadPath = (requestIdentifier: string): string =>
  `/leads/${encodeURIComponent(leadKeyFor(requestIdentifier))}`;

interface Facts {
  readonly cid: string;
  readonly requestIdentifier: string;
  readonly leadKey: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly roofAgeYears: number | null;
  readonly roofAgeBasis: string;
  readonly sourceManifestCid: string;
  readonly hasOpenPermit: boolean;
}

/** Property facts read from the index in `beforeAll`, keyed by property CID. */
const facts = new Map<string, Facts>();
let cleanup: LeadsCleanup | undefined;

function factsOf(cid: string): Facts {
  const found = facts.get(cid);
  if (found === undefined) throw new Error(`no index facts loaded for ${cid}`);
  return found;
}

async function signIn(page: Page, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(SEEDED_USERNAME);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.locator('[data-route="map"]')).toBeVisible();
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const raw = await page.evaluate(() => localStorage.getItem("crm.session"));
  const idToken = raw === null ? undefined : (JSON.parse(raw) as { idToken?: string }).idToken;
  if (idToken === undefined) throw new Error("no Cognito session in localStorage");
  return { Authorization: `Bearer ${idToken}` };
}

/** `GET /api/trpc/{procedure}?input=...`, the unbatched query shape the tRPC server also accepts. */
async function trpcQuery<T>(page: Page, procedure: string, input: unknown): Promise<T> {
  const response = await page.request.get(
    `/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`,
    { headers: await authHeaders(page) },
  );
  expect(response.ok(), `${procedure} HTTP ${response.status()}`).toBe(true);
  return ((await response.json()) as { result: { data: T } }).result.data;
}

async function loadFacts(page: Page, cid: string): Promise<Facts> {
  const data = await trpcQuery<{
    property: {
      requestIdentifier: string;
      latitude: number | null;
      longitude: number | null;
      roofAgeYears: number | null;
      roofAgeBasis: string;
      sourceManifestCid: string;
    } | null;
    permits: { statusClass: string | null }[];
  }>(page, "property.get", { propertyCid: cid });
  const p = data.property;
  if (p === null || p.latitude === null || p.longitude === null) {
    throw new Error(`property ${cid} is not in the served run or has no location`);
  }
  return {
    cid,
    requestIdentifier: p.requestIdentifier,
    leadKey: leadKeyFor(p.requestIdentifier),
    latitude: p.latitude,
    longitude: p.longitude,
    roofAgeYears: p.roofAgeYears,
    roofAgeBasis: p.roofAgeBasis,
    sourceManifestCid: p.sourceManifestCid,
    hasOpenPermit: data.permits.some((permit) => permit.statusClass === "open"),
  };
}

/** The `leads.create` input exactly as LeadCreateAction.toCreateInput builds it. */
function createInput(f: Facts): Record<string, unknown> {
  return {
    fips: TRAVIS_FIPS,
    requestIdentifier: f.requestIdentifier,
    address: `TCAD ${f.requestIdentifier}`,
    lat: f.latitude,
    lon: f.longitude,
    signals: {
      ...(f.roofAgeYears === null ? {} : { roofAgeYears: f.roofAgeYears }),
      roofAgeBasis: f.roofAgeBasis,
    },
    sourceManifestCid: f.sourceManifestCid,
    createdFrom: "map",
  };
}

async function listLeadKeys(page: Page): Promise<string[]> {
  const data = await trpcQuery<{ leads: { leadKey: string }[] }>(page, "leads.list", {
    limit: 100,
  });
  return data.leads.map((lead) => lead.leadKey);
}

/** Opens the Map drawer for a property through the `sel` deep link (no pin-drop needed). */
async function openDrawer(page: Page, cid: string): Promise<Locator> {
  await page.goto(`/?sel=${cid}`); // the Map is the app's index route, not /map
  const drawer = page.locator(`aside[role="dialog"][data-property-cid="${cid}"]`);
  await expect(drawer).toBeVisible();
  return drawer;
}

/** Taps "Create lead" in the drawer and returns the resulting status line. */
async function createFromDrawer(drawer: Locator): Promise<Locator> {
  await drawer.getByRole("button", { name: "Create lead" }).click();
  const state = drawer.getByRole("status");
  await expect(state).toBeVisible();
  return state;
}

const leadCount = (page: Page): Locator => page.getByText(/^\d+ leads?$/);
const leadLink = (page: Page, f: Facts): Locator =>
  page.getByRole("link", { name: `TCAD ${f.requestIdentifier}` });

/** Screenshot to docs/evidence/img/B-07-TC-{nnn}-{step}.png, attached to the report. */
async function shot(page: Page, tc: string, step: string): Promise<void> {
  const name = `B-07-TC-${tc}-${step.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  mkdirSync(EVIDENCE_IMG_DIR, { recursive: true });
  const body = await page.screenshot({ path: resolve(EVIDENCE_IMG_DIR, name) });
  await test.info().attach(name, { body, contentType: "image/png" });
}

/** Great-circle distance in miles (haversine, Earth radius 3,958.8 mi: test plan § 3). */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

test.describe("B-07 leads", () => {
  test.skip(SEEDED_PASSWORD === undefined, "CRM_TEST_PASSWORD not set (Secrets Manager only)");
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }, testInfo) => {
    if (!SEEDED_PASSWORD) return;
    const baseURL = testInfo.project.use.baseURL;
    const page = await browser.newPage(baseURL === undefined ? {} : { baseURL });
    try {
      await signIn(page, SEEDED_PASSWORD);
      for (const cid of [P_5_52, P_AGE48, P_5_89]) facts.set(cid, await loadFacts(page, cid));
    } finally {
      await page.close();
    }
    const keys = [P_5_52, P_AGE48, P_5_89].map((cid) => factsOf(cid).leadKey);
    cleanup = createLeadsCleanup(keys);
    await cleanup.deleteLeads(keys); // clean slate: reruns are otherwise refused by design
  });

  test.afterAll(async () => {
    if (cleanup === undefined) return;
    if (CLEANUP_AFTER) {
      await cleanup.deleteLeads(cleanup.allowed);
    } else {
      console.info(
        "B-07 cleanup skipped after the run (set CRM_E2E_CLEANUP=1 to delete test leads)",
      );
    }
  });

  test.beforeEach(async ({ page }) => {
    if (!SEEDED_PASSWORD) return;
    await signIn(page, SEEDED_PASSWORD);
  });

  // ---- Edge case: the list before anything has been created -------------------------------

  test("B-07-TC-016 empty list state", async ({ page }) => {
    await page.goto("/leads");
    const empty = page.getByText("No leads yet");
    const count = leadCount(page);
    await expect(empty.or(count)).toBeVisible();
    // The three test leads were just deleted; other leads of this user would make the state
    // legitimately non-empty, so say so instead of passing or failing on someone else's data.
    test.skip(await count.isVisible(), "this user already has leads beyond the test properties");
    await expect(empty).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await shot(page, "016", "empty-list");
  });

  // ---- AC-1: create ------------------------------------------------------------------------

  test("B-07-TC-001 create lead from property drawer", async ({ page }) => {
    const f = factsOf(P_5_52);
    const drawer = await openDrawer(page, P_5_52);
    await expect(drawer.locator('[data-field="roof_age_years"]')).toHaveText(
      `${f.roofAgeYears} yrs`,
    );
    const state = await createFromDrawer(drawer);
    await expect(state).toContainText("Lead created");
    await shot(page, "001", "created");

    await page.goto("/leads");
    const first = page.locator("li[data-lead-id]").first();
    await expect(first).toContainText(`TCAD ${f.requestIdentifier}`);
    await expect(first).toContainText("New");
    await expect(leadLink(page, f)).toHaveCount(1);
    // "Created YYYY-MM-DD HH:MM UTC" is within the last few minutes (minute-truncated stamp).
    const stamp = /Created (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC/.exec(
      (await first.textContent()) ?? "",
    );
    expect(stamp, "created-at is shown").not.toBeNull();
    const ageMs = Date.now() - Date.parse(`${stamp?.[1]}T${stamp?.[2]}:00Z`);
    expect(Math.abs(ageMs)).toBeLessThan(3 * 60_000);
    await shot(page, "001", "top-of-list");
  });

  test.fixme(
    "B-07-TC-002 create lead from permit row",
    {
      annotation: {
        type: "known-gap",
        description:
          "The permit cards in the property drawer (PropertyDetail.tsx) have no Create lead action; only the property-level LeadCreateAction exists. Un-fix when a permit-row action ships.",
      },
    },
    () => {},
  );

  test("B-07-TC-003 signals snapshot and source CID", async ({ page }) => {
    const f = factsOf(P_5_52);
    await page.goto(leadPath(f.requestIdentifier));
    const signals = page.getByRole("region", { name: "Current signals" });
    await expect(signals).toBeVisible();
    await expect(signals).toContainText(`${f.roofAgeYears} yrs`);
    await expect(signals).toContainText(f.roofAgeBasis);
    // Character-for-character: the stored CID equals both the index row's and the plan's CID.
    expect(f.sourceManifestCid).toBe(MANIFEST_CID);
    await expect(signals.locator(`[data-cid="${MANIFEST_CID}"]`).first()).toBeVisible();
    test.info().annotations.push({
      type: "known-gap",
      description:
        "Permit id is not asserted: LeadCreateAction.toCreateInput sends no openPermitId, so the snapshot shows 'No open permit at capture' instead of the permit.",
    });
    await shot(page, "003", "snapshot");
  });

  test("B-07-TC-004 no contractor shows reason", async ({ page }) => {
    await page.goto(leadPath(factsOf(P_5_52).requestIdentifier));
    const signals = page.getByRole("region", { name: "Current signals" });
    const contractor = signals
      .locator("div", { hasText: "Contractor, as printed on permit" })
      .last();
    // Reason surfaced (not an invented name or a blank), and no BBB rating either (GAP-2: copy
    // is asserted by meaning, not by the literal string).
    await expect(contractor).toContainText(/not (published|available)|unresolved/i);
    await expect(signals.locator("div", { hasText: /^BBB/ }).last()).toContainText(
      /not (available|checked)|unresolved/i,
    );
    await shot(page, "004", "contractor-reason");
  });

  // ---- AC-2: duplicates --------------------------------------------------------------------

  test("B-07-TC-005 duplicate shows Already a lead", async ({ page }) => {
    const drawer = await openDrawer(page, P_5_52);
    await drawer.getByRole("button", { name: "Create lead" }).click();
    const state = drawer.getByRole("status");
    await expect(state).toContainText("Already a lead");
    await expect(state).not.toContainText("Lead created");
    await expect(state.getByRole("link", { name: "View leads" })).toHaveAttribute("href", "/leads");
    await shot(page, "005", "already-a-lead");
  });

  test("B-07-TC-006 duplicate writes no row", async ({ page }) => {
    const f = factsOf(P_5_52);
    await page.goto("/leads");
    await expect(leadLink(page, f)).toHaveCount(1);
    const before = (await leadCount(page).textContent()) ?? "";

    const drawer = await openDrawer(page, P_5_52);
    await drawer.getByRole("button", { name: "Create lead" }).click();
    await expect(drawer.getByRole("status")).toContainText("Already a lead");

    await page.goto("/leads");
    await page.reload();
    await expect(leadLink(page, f)).toHaveCount(1);
    await expect(leadCount(page)).toHaveText(before);
    expect((await listLeadKeys(page)).filter((key) => key === f.leadKey)).toHaveLength(1);
  });

  test("B-07-TC-007 20 concurrent creates", async ({ page }) => {
    const f = factsOf(P_AGE48);
    await page.goto("/leads");
    const headers = await authHeaders(page);
    // This AWS account allows 10 concurrent Lambda executions, so some of 20 simultaneous calls are
    // throttled (HTTP 503). A real client retries a throttle; so does this test, and it counts them.
    let throttled = 0;
    const post = async (): Promise<APIResponse> => {
      for (let attempt = 1; ; attempt++) {
        const res = await page.request.post("/api/trpc/leads.create", {
          headers,
          data: createInput(f),
        });
        if (res.status() !== 503 || attempt >= 8) return res;
        throttled += 1;
        await page.waitForTimeout(150 * attempt + Math.floor(Math.random() * 150));
      }
    };
    const responses: APIResponse[] = await Promise.all(Array.from({ length: 20 }, post));
    const bodies = await Promise.all(responses.map((r) => r.text()));
    const created = responses.filter((r) => r.status() === 200).length;
    const refused = responses.filter(
      (r, i) => r.status() === 409 && (bodies[i] ?? "").includes("Already a lead"),
    ).length;
    // The tally (status -> count, plus each distinct error message) is the TC-007 evidence.
    const tally: Record<string, number> = {};
    responses.forEach((r, i) => {
      const message = /"message":"([^"]*)"/.exec(bodies[i] ?? "")?.[1] ?? "";
      const key = `${r.status()} ${message}`.trim();
      tally[key] = (tally[key] ?? 0) + 1;
    });
    await test.info().attach("TC-007-tally.json", {
      body: JSON.stringify({ final: tally, throttledAndRetried: throttled }, null, 2),
      contentType: "application/json",
    });
    expect({ created, refused, tally }).toEqual({ created: 1, refused: 19, tally });

    await page.reload();
    await expect(leadLink(page, f)).toHaveCount(1);
    expect((await listLeadKeys(page)).filter((key) => key === f.leadKey)).toHaveLength(1);
    // 0 lost updates: the single winner is still `new`.
    await page.goto(leadPath(f.requestIdentifier));
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("new");
    await shot(page, "007", "one-winner");
  });

  // ---- AC-3: status and notes --------------------------------------------------------------
  // TC-009 runs before TC-008 because TC-008 leaves the lead at `contacted`.

  test("B-07-TC-009 failed save undone", async ({ page }) => {
    await page.goto(leadPath(factsOf(P_5_52).requestIdentifier));
    const status = page.getByRole("combobox", { name: "Status" });
    await expect(status).toBeVisible();
    const original = await status.inputValue();
    const target = original === "contacted" ? "qualified" : "contacted";

    await page.route("**/api/trpc/leads.updateStatus**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "forced failure", code: -32603 } }),
      }),
    );
    await status.selectOption(target);
    // Behavior, not copy (GAP-2): an error is announced and mentions the save/status.
    await expect(page.getByRole("alert")).toContainText(/status|save/i);
    await expect(status).toHaveValue(original);
    await shot(page, "009", "error-and-reverted");

    await page.unroute("**/api/trpc/leads.updateStatus**");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue(original);
  });

  test("B-07-TC-008 status and note persist", async ({ page }) => {
    const note = `${RUN_TAG} Spoke with homeowner, roof confirmed 22 years old`;
    await page.goto(leadPath(factsOf(P_5_52).requestIdentifier));
    const status = page.getByRole("combobox", { name: "Status" });
    await status.selectOption("contacted");
    await expect(status).toHaveValue("contacted");

    await page.getByLabel("Add a note").fill(note);
    await page.getByRole("button", { name: "Add note" }).click();
    const notes = page.getByRole("region", { name: "Notes" });
    await expect(notes).toContainText(note);
    await shot(page, "008", "saved");

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("contacted");
    await expect(page.getByRole("region", { name: "Notes" })).toContainText(note);
    // History records both the status change and the note (plus the creation event).
    const history = page.getByRole("region", { name: "History" }).locator("li");
    expect(await history.count()).toBeGreaterThanOrEqual(2);
    await shot(page, "008", "after-reload");
  });

  test("B-07-TC-010 note round-trip", async ({ page }) => {
    const filler = "Roof walk notes, flashing & vents ok; ".repeat(40).slice(0, 900);
    const note = `${RUN_TAG} "quoted" & 'single'\nsecond line ${filler}`.slice(0, 1000);
    expect(note).toHaveLength(1000);
    await page.goto(leadPath(factsOf(P_5_52).requestIdentifier));
    await page.getByLabel("Add a note").fill(note);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByRole("region", { name: "Notes" })).toContainText(RUN_TAG);

    await page.reload();
    const text = await page.getByRole("region", { name: "Notes" }).textContent();
    // textContent keeps the line break and every character, so a plain includes() is exact.
    expect(text ?? "").toContain(note);
  });

  // ---- AC-4: filters -----------------------------------------------------------------------

  test("B-07-TC-011 combined filters agree with map", async ({ page }) => {
    // Third lead for the count; "Already a lead" is fine when a previous run left it behind.
    const drawer = await openDrawer(page, P_5_89);
    await drawer.getByRole("button", { name: "Create lead" }).click();
    await expect(drawer.getByRole("status")).toContainText(/Lead created|Already a lead/);

    // Expected set from the index itself (roof >= 20, an open permit, <= 10 mi of Round Rock).
    const expected = [P_5_52, P_AGE48, P_5_89]
      .map(factsOf)
      .filter(
        (f) =>
          (f.roofAgeYears ?? 0) >= 20 &&
          f.hasOpenPermit &&
          milesBetween(ROUND_ROCK, { lat: f.latitude, lng: f.longitude }) <= 10,
      );

    await page.goto("/leads");
    await page
      .getByRole("group", { name: "Roof age threshold" })
      .getByRole("button", { name: "20", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Permit status" })
      .getByRole("button", { name: "Open" })
      .click();
    await page.getByLabel("Center latitude").fill(String(ROUND_ROCK.lat));
    await page.getByLabel("Center longitude").fill(String(ROUND_ROCK.lng));
    await page.getByLabel("Radius, mi").fill("10");

    if (expected.length === 0) {
      await expect(page.getByText("No leads match these filters")).toBeVisible();
    } else {
      await expect(leadCount(page)).toHaveText(
        `${expected.length} ${expected.length === 1 ? "lead" : "leads"}`,
      );
      for (const f of expected) await expect(leadLink(page, f)).toHaveCount(1);
    }
    for (const f of [P_5_52, P_AGE48, P_5_89].map(factsOf).filter((x) => !expected.includes(x))) {
      await expect(leadLink(page, f)).toHaveCount(0);
    }
    test.info().annotations.push({
      type: "scope",
      description:
        "Map header count is not compared: the map counts every matching property, the list only leads. List count is checked against the index-derived set instead; the 50+ lead variant is GAP-1.",
    });
    await shot(page, "011", "combined-filters");
  });

  test("B-07-TC-012 filters in URL reopen same view", async ({ page, browser, baseURL }) => {
    await page.goto("/leads");
    await page
      .getByRole("group", { name: "Roof age threshold" })
      .getByRole("button", { name: "20", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Permit status" })
      .getByRole("button", { name: "Open" })
      .click();
    await page.getByLabel("Center latitude").fill(String(ROUND_ROCK.lat));
    await page.getByLabel("Center longitude").fill(String(ROUND_ROCK.lng));
    await page.getByLabel("Radius, mi").fill("10");
    await expect(page).toHaveURL(/roof=20/);
    const url = new URL(page.url());
    for (const [key, value] of [
      ["roof", "20"],
      ["permit", "open"],
      ["lat", String(ROUND_ROCK.lat)],
      ["lng", String(ROUND_ROCK.lng)],
      ["r", "10"],
    ] as const) {
      expect(url.searchParams.get(key), `URL param ${key}`).toBe(value);
    }
    const countText = await leadCount(page)
      .textContent({ timeout: 5_000 })
      .catch(() => null);

    // A second, fresh browser context stands in for "a new private window".
    const other = await browser.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(page.viewportSize() === null ? {} : { viewport: page.viewportSize() }),
    });
    try {
      const second = await other.newPage();
      await signIn(second, SEEDED_PASSWORD ?? "");
      await second.goto(`${url.pathname}${url.search}`);
      await expect(
        second
          .getByRole("group", { name: "Roof age threshold" })
          .getByRole("button", { name: "20", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        second.getByRole("group", { name: "Permit status" }).getByRole("button", { name: "Open" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(second.getByLabel("Radius, mi")).toHaveValue("10");
      if (countText === null) {
        await expect(second.getByText("No leads match these filters")).toBeVisible();
      } else {
        await expect(leadCount(second)).toHaveText(countText);
      }
      await shot(second, "012", "reopened");
    } finally {
      await other.close();
    }
  });

  test("B-07-TC-013 no-match state", async ({ page }) => {
    // 60 yr is not a chip, so the combination is set through the URL (the same state the chips write).
    await page.goto(
      `/leads?roof=60&permit=closed&lat=${ROUND_ROCK.lat}&lng=${ROUND_ROCK.lng}&r=0.5`,
    );
    await expect(page.getByText("No leads match these filters")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await shot(page, "013", "no-match");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/roof=|permit=|lat=|lng=|r=/);
  });

  // ---- AC-5 and scale: blocked by known gaps -----------------------------------------------

  test.fixme(
    "B-07-TC-014 not in Run n",
    {
      annotation: {
        type: "known-gap",
        description:
          "GAP-5: needs a second published run that drops a property present in run 1. The UI also words it 'Not in the current run' (no run number), to be reconciled with the story's 'not in Run {n}'.",
      },
    },
    () => {},
  );

  test.fixme(
    "B-07-TC-015 no stale values",
    {
      annotation: {
        type: "known-gap",
        description: "GAP-5: needs a second published run (see TC-014).",
      },
    },
    () => {},
  );

  // ---- Edge: unknown lead ------------------------------------------------------------------

  test("B-07-TC-017 unknown lead not found", async ({ page }) => {
    await page.goto("/leads/does-not-exist");
    // The page retries once, then stops with an error banner (no spinner left running).
    await expect(page.getByRole("alert")).toContainText(/could not be loaded/i, {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
    test.info().annotations.push({
      type: "known-gap",
      description:
        "LeadDetail shows its generic load-error banner with Retry for an unknown id; the plan's 'lead not found' state with a link back to /leads is not implemented.",
    });
    await shot(page, "017", "not-found");
  });

  // ---- NFRs --------------------------------------------------------------------------------

  test("B-07-TC-NF-04 responsive and tokens", async ({ page }) => {
    const f = factsOf(P_5_52);
    for (const path of ["/leads", leadPath(f.requestIdentifier)]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `${path} overflows horizontally`).toBeLessThanOrEqual(clientWidth);
      const audit = await page.evaluate(atlasTokenAudit, AUDITED_PROPERTIES);
      expect(audit.checkedElements).toBeGreaterThan(0);
      expect(audit.violations, `${path}: ${JSON.stringify(audit.violations, null, 2)}`).toEqual([]);
      await shot(page, "NF-04", path.startsWith("/leads/") ? "detail" : "list");
    }
  });

  // Runs last: it creates and deletes the P_5_89 lead 20 times, so it must not precede TC-011.
  test("B-07-TC-NF-01 create latency p95", async ({ page }) => {
    test.setTimeout(300_000);
    const f = factsOf(P_5_89);
    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      await cleanup?.deleteLeads([f.leadKey]);
      const drawer = await openDrawer(page, P_5_89);
      const startedAt = Date.now();
      await drawer.getByRole("button", { name: "Create lead" }).click();
      await drawer.getByRole("link", { name: "View leads" }).click();
      await expect(page.locator("li[data-lead-id]").first()).toContainText(
        `TCAD ${f.requestIdentifier}`,
      );
      samples.push(Date.now() - startedAt);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.POSITIVE_INFINITY;
    await test.info().attach("B-07-TC-NF-01-samples.txt", {
      body: `samples ms: ${samples.join(", ")}\np95 ms: ${p95}\n`,
      contentType: "text/plain",
    });
    expect(p95, `p95 ${p95} ms`).toBeLessThanOrEqual(2000);
    // Leave the P_5_89 lead in place for any later manual check.
  });

  test.fixme(
    "B-07-TC-NF-03 list load p95",
    {
      annotation: {
        type: "known-gap",
        description:
          "GAP-1: the full-county index is not published (A-11 pending); the slice has 14 properties, so 50 distinct leads cannot exist yet.",
      },
    },
    () => {},
  );
});
