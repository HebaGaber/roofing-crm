// Shell UI fix (design-review-log rows 3 and 22; boards CrmShell1440, CrmShell390, CrmAppsMenu,
// CrmDataChip, CrmAccount, CrmBottomNav): the top bar carries the county, the data chip (run from
// the API, never hard-coded), the Apps menu and the account menu with Sign out; the rail shows
// contained icon + label + "Soon" items; the 390 More tab has an icon and its sheet sits above
// the bottom nav with Coming-soon rows, Apps and Sign out. Written before the components.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryState<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

const MANIFEST = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const RUN_ID = "travis-202609-permits-20261021t103516z";

const refetch = vi.fn();
let indexState: QueryState<{
  manifestCid: string;
  runId: string | null;
  promotedAt: string;
  propertyCount: number;
  permitCount: number;
  traceId: string;
}>;
let linksState: QueryState<{ countyLensUrl: string; landingPageUrl: string | null }>;

vi.mock("../../../src/components/AppShell/shellApi", () => ({
  useShellIndexInfo: () => indexState,
  useShellAppLinks: () => linksState,
}));

const signOutMock = vi.fn(() => localStorage.removeItem("crm.session"));
vi.mock("../../../src/auth/signOut", () => ({ signOut: () => signOutMock() }));

import { AppShell, DESTINATIONS } from "../../../src/components/AppShell";

const shellDir = join(__dirname, "../../../src/components/AppShell");
const css = (file: string): string => readFileSync(join(shellDir, file), "utf8");

function Where(): ReactElement {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

function renderShell(path = "/"): QueryClient {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sign-in" element={<Where />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Where />} />
            <Route path="/coming-soon/:section" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  refetch.mockReset();
  signOutMock.mockClear();
  indexState = {
    data: {
      manifestCid: MANIFEST,
      runId: RUN_ID,
      promotedAt: "2026-10-21T10:35:16Z",
      propertyCount: 12,
      permitCount: 34,
      traceId: "t",
    },
    isPending: false,
    isError: false,
    refetch,
  };
  linksState = {
    data: { countyLensUrl: "https://countylens.example.test", landingPageUrl: null },
    isPending: false,
    isError: false,
    refetch,
  };
  localStorage.setItem("crm.session", "{}");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("top bar", () => {
  it("shows the title and Travis County as the one published county", () => {
    renderShell();
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("heading", { name: "Roofing CRM" })).toBeTruthy();
    const county = within(bar).getByText("Travis County, TX");
    expect(county.closest("[data-county]")?.getAttribute("title")).toBe(
      "Travis County, TX is the only county CountyLens publishes",
    );
  });

  it("data chip names the promoted run from the API and opens the data-source panel", () => {
    renderShell();
    const chip = screen.getByRole("button", { name: `Data: CountyLens run ${RUN_ID}` });
    expect(chip?.getAttribute("data-state")).toBe("ready");
    fireEvent.click(chip);
    const panel = screen.getByRole("dialog", { name: "Data source" });
    expect(panel?.textContent).toContain("The lead index is built from the CountyLens manifest");
    expect(panel?.textContent).toContain("2026-10-21 10:35:16 UTC");
    expect(panel?.textContent).toContain("The CRM reads only published CountyLens data.");
    expect(panel?.textContent).toContain(`Index serving run ${RUN_ID}`);
    expect(panel.querySelector(`[data-cid="${MANIFEST}"]`)).not.toBeNull();
    const link = within(panel).getByRole("link", { name: /Open CountyLens/ });
    expect(link?.getAttribute("href")).toBe("https://countylens.example.test");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Data source" })).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it("data chip says why the run is missing when the index has no run id", () => {
    const ready = indexState.data;
    if (ready === undefined) throw new Error("fixture");
    indexState = { ...indexState, data: { ...ready, runId: null } };
    renderShell();
    expect(
      screen.getByRole("button", { name: "Data: CountyLens run not recorded in the index" }),
    ).toBeTruthy();
  });

  it("data chip shows a loading state, then Index unavailable with Retry on error", () => {
    indexState = { ...indexState, data: undefined, isPending: true };
    renderShell();
    expect(screen.getByRole("button", { name: "Data: loading" })?.getAttribute("data-state")).toBe(
      "loading",
    );
    cleanup();

    indexState = { ...indexState, data: undefined, isPending: false, isError: true };
    renderShell();
    const chip = screen.getByRole("button", { name: "Data: Index unavailable" });
    fireEvent.click(chip);
    const panel = screen.getByRole("dialog", { name: "Data source" });
    expect(panel?.textContent).toContain("The lead index is unavailable");
    fireEvent.click(within(panel).getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("Apps menu lists CountyLens (from config), Roofing CRM as current, and the landing page", () => {
    renderShell();
    const apps = screen.getByRole("button", { name: "Apps" });
    fireEvent.click(apps);
    const menu = screen.getByRole("menu", { name: "Apps" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "CountyLens",
      "Roofing CRM",
      "Landing pageNot available yet",
    ]);
    expect(items[0]?.getAttribute("href")).toBe("https://countylens.example.test");
    expect(items[1]?.getAttribute("aria-current")).toBe("page");
    expect(items[1]?.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(items[2]?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Apps" })).toBeNull();
    expect(document.activeElement).toBe(apps);
  });

  it("Apps menu links the landing page when it is configured", () => {
    linksState = {
      ...linksState,
      data: { countyLensUrl: "https://countylens.example.test", landingPageUrl: "https://l.test" },
    };
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Apps" }));
    expect(screen.getByRole("menuitem", { name: "Landing page" })?.getAttribute("href")).toBe(
      "https://l.test",
    );
  });

  it("account menu signs out: clears the session and lands on /sign-in", async () => {
    const client = renderShell();
    const clear = vi.spyOn(client, "clear");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    const menu = screen.getByRole("menu", { name: "Account" });
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("crm.session")).toBeNull();
    expect(clear).toHaveBeenCalled();
    expect(screen.getByTestId("where")?.textContent).toContain("/sign-in");
  });
});

describe("navigation", () => {
  it("Ask uses the robot icon (smart_toy), as on CrmBottomNav", () => {
    expect(DESTINATIONS.find((d) => d.to === "/ask")?.icon).toBe("smart_toy");
    renderShell();
    const ask = screen.getByRole("link", { name: "Ask" });
    expect(ask.querySelector('[data-icon="smart_toy"]')).not.toBeNull();
  });

  it("rail items are icon + short label + Soon, aria-disabled with the Coming soon tooltip", () => {
    renderShell();
    const rail = screen.getByLabelText("Roadmap sections (not yet built)");
    // jsdom applies the < 600 px CSS (rail display: none), so query hidden nodes too.
    const rows = within(rail).getAllByRole("button", { hidden: true });
    expect(rows).toHaveLength(5);
    const campaigns = within(rail).getByRole("button", { name: /Campaigns/, hidden: true });
    expect(campaigns?.getAttribute("aria-disabled")).toBe("true");
    expect(campaigns?.getAttribute("title")).toBe("Coming soon");
    expect(campaigns.querySelector('[data-icon="campaign"]')).not.toBeNull();
    expect(within(campaigns).getByText("Soon")).toBeTruthy();
    fireEvent.click(campaigns);
    expect(screen.getByTestId("where")?.textContent).toContain("/coming-soon/campaigns");
  });

  it("rail items stack vertically and clip inside the 80 px rail", () => {
    const rail = css("RoadmapItem.module.css");
    expect(rail).toMatch(/\.rail\s*{[^}]*flex-direction:\s*column/);
    expect(rail).toMatch(/\.label\s*{[^}]*text-overflow:\s*ellipsis/);
    expect(rail).toMatch(/\.rail\s*{[^}]*max-width:\s*100%/);
  });

  it("More tab has the more_horiz icon and its sheet lists Coming soon, Apps and Sign out", () => {
    renderShell();
    const more = screen.getByRole("button", { name: "More" });
    expect(more.querySelector('[data-icon="more_horiz"]')).not.toBeNull();
    fireEvent.click(more);
    const sheet = screen.getByRole("dialog", { name: "More" });
    for (const [label, icon] of [
      ["Campaigns", "campaign"],
      ["Estimates", "request_quote"],
      ["Jobs", "construction"],
      ["Invoices", "receipt_long"],
      ["Outreach", "mail"],
    ] as const) {
      const row = within(sheet).getByRole("button", { name: new RegExp(label) });
      expect(row?.getAttribute("aria-disabled")).toBe("true");
      expect(row?.getAttribute("title")).toBe("Coming soon");
      expect(row.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
    }
    expect(sheet?.textContent).toContain("Plan outreach to groups of leads.");
    expect(within(sheet).getByRole("link", { name: "CountyLens" })?.getAttribute("href")).toBe(
      "https://countylens.example.test",
    );
    expect(within(sheet).getByRole("button", { name: /Sign out/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("a More sheet row opens its Coming soon page and closes the sheet", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    fireEvent.click(within(sheet).getByRole("button", { name: /Jobs/ }));
    expect(screen.getByTestId("where")?.textContent).toContain("/coming-soon/jobs");
    expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  });

  it("the More sheet sits above the bottom nav and its rows are not drawn disabled", () => {
    const sheet = css("MoreSheet.module.css");
    expect(sheet).toMatch(
      /\.panel\s*{[^}]*bottom:\s*calc\(var\(--space-10\) \+ var\(--space-4\)\)/,
    );
    expect(sheet).not.toMatch(/disabled-opacity/);
  });

  it("More sheet Sign out clears the session and lands on /sign-in", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "More" });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole("button", { name: /Sign out/ }));
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("where")?.textContent).toContain("/sign-in");
  });
});

describe("AppShell main region: full-bleed Map, padded everywhere else", () => {
  it("drops the page margin on the Map route only", () => {
    renderShell("/");
    expect(screen.getByRole("main").getAttribute("data-layout")).toBe("full-bleed");
    cleanup();
    renderShell("/coming-soon/campaigns");
    expect(screen.getByRole("main").getAttribute("data-layout")).toBe("padded");
  });

  it("the stylesheet zeroes the padding for the full-bleed class above the 600 px margin rule", () => {
    const sheet = readFileSync(join(shellDir, "../AppShell.module.css"), "utf8");
    const rule = /\.main\.mainFullBleed\s*\{([^}]*)\}/.exec(sheet);
    expect(rule?.[1]).toMatch(/padding:\s*0;/);
    // The compact and medium+ page margins still apply to every other route.
    expect(sheet).toMatch(/\.main\s*\{[^}]*padding:\s*var\(--space-4\)/);
    expect(sheet).toMatch(
      /@media \(min-width: 600px\)[\s\S]*\.main\s*\{\s*padding:\s*var\(--space-6\)/,
    );
  });
});
