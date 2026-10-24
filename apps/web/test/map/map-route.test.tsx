// The Map route's composition after the breakpoint rebuild: one DOM at every width with the
// filters pane, the map (with its overlay stack), the results sheet and the drawer slot, and
// every e2e hook (data-route, crm-map, search-results, data-state, aside[data-property-cid])
// unchanged. The MapLibre map and the tRPC client are stubbed; layout per width is CSS
// (Map.module.css) and is proved live by the responsive Playwright specs.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const zoomToDetail = vi.fn();
const placeAtCenter = vi.fn();
const showCounty = vi.fn();
/** The props the route last handed the map (pin mode, accuracy circle). */
let lastMapProps: { pinMode?: boolean; accuracy?: { meters: number } | null } = {};
let reportedMode: "overview" | "detail" = "overview";
/** What the route last handed the map for the overview (null = client binning fallback). */
let lastOverviewCells: readonly { id: string; count: number }[] | null | undefined;
let lastOverviewPermits: readonly { permits: number }[] | null | undefined;
let reportZoomStep: ((zoom: number) => void) | undefined;

vi.mock("../../src/components/Map/CrmMap.js", () => ({
  CrmMap: forwardRef(function StubMap(
    props: {
      onViewModeChange?: (mode: "overview" | "detail") => void;
      onZoomStepChange?: (zoom: number) => void;
      overviewCells?: readonly { id: string; count: number }[] | null;
      overviewPermits?: readonly { permits: number }[] | null;
      pinMode?: boolean;
      accuracy?: { meters: number } | null;
    },
    ref,
  ) {
    lastMapProps = props;
    lastOverviewCells = props.overviewCells;
    lastOverviewPermits = props.overviewPermits;
    reportZoomStep = props.onZoomStepChange;
    useImperativeHandle(ref, () => ({
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      recenter: vi.fn(),
      zoomToDetail,
      placeAtCenter,
      showCounty,
    }));
    useEffect(() => props.onViewModeChange?.(reportedMode), [props]);
    return <div data-testid="crm-map" />;
  }),
}));

const property = {
  propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
  requestIdentifier: "0201885122",
  latitude: 30.44,
  longitude: -97.62,
  coordinateSource: "gis_centroid",
  propertyType: "Building",
  propertyUsageType: "Residential",
  roofAgeYears: 20,
  roofAgeBasis: "permit",
  roofAgeConfidence: "high",
  isLongTenure: null,
  ownerKind: null,
  ownerAreaClass: null,
  ownerIsOutOfArea: null,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [],
  capturedAt: "2026-10-20T00:00:00Z",
  cid: "bafkreitablecid",
  runId: "run-3",
};

let searchResult: { properties: (typeof property)[] } = { properties: [property] };

const RUN = "travis-202609-permits-20261021t103516z";
function overviewFor(input: { zoom: number; permits?: boolean }) {
  return {
    zoom: input.zoom,
    agedYears: 15,
    cells: [
      {
        q: -29,
        r: 1499,
        lat: 30.26,
        lng: -97.74,
        count: 120,
        withRoofAge: 100,
        medianRoofAge: 21,
        agedCount: 70,
        ...(input.permits === true ? { openPermits: 3, stalledPermits: 2, maxOpenDays: 900 } : {}),
      },
    ],
    counts: {
      total: 125,
      matched: 125,
      binned: 120,
      excludedNoCoordinates: 5,
      excludedNoRoofDate: 0,
      binnedWithoutRoofAge: 20,
      ...(input.permits === true ? { openPermits: 3, stalledPermits: 2 } : {}),
    },
    manifestCid: "bafkreimanifest",
    runId: RUN,
    traceId: "t",
  };
}
const overviewCalls: unknown[] = [];
let overviewFails = false;
let searchFails = false;
let searchCalls = 0;

const opts = (key: string, fn: () => unknown) => (input: unknown) => ({
  queryKey: [key, input],
  queryFn: async () => fn(),
});

vi.mock("@crm/api-client/react", () => ({
  useTRPC: () => ({
    search: {
      properties: {
        queryOptions: opts("search.properties", () => {
          searchCalls += 1;
          if (searchFails) throw new Error("index down");
          return searchResult;
        }),
      },
      permits: { queryOptions: opts("search.permits", () => ({ permits: [] })) },
      countyOverview: {
        queryOptions: (input: { zoom: number; permits?: boolean }) => ({
          queryKey: ["search.countyOverview", input],
          queryFn: async () => {
            overviewCalls.push(input);
            if (overviewFails) throw new Error("index down");
            return overviewFor(input);
          },
        }),
      },
    },
    property: {
      get: {
        queryOptions: opts("property.get", () => ({
          property,
          permits: [],
          bbbStatus: null,
          bbbStatusReason: null,
          lineageUrl: "https://example.com/lineage",
        })),
      },
    },
  }),
}));

vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
}));

import { Component as MapRoute } from "../../src/routes/Map/Map";

afterEach(() => {
  cleanup();
  zoomToDetail.mockReset();
  reportedMode = "overview";
  searchResult = { properties: [property] };
  placeAtCenter.mockReset();
  showCounty.mockReset();
  lastMapProps = {};
  overviewCalls.length = 0;
  overviewFails = false;
  searchFails = false;
  searchCalls = 0;
  lastOverviewCells = undefined;
  lastOverviewPermits = undefined;
});

function renderAt(url: string): HTMLElement {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}")),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <MapRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return document.querySelector('[data-route="map"]') as HTMLElement;
}

describe("Map route layout", () => {
  it("with no centre: map, controls, county card and an explained empty results sheet", () => {
    const page = renderAt("/");
    expect(page).not.toBeNull();
    expect(screen.getByTestId("crm-map")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Use my location" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Layers" })).not.toBeNull();
    expect(page.querySelector("[data-county-card]")?.textContent).toMatch(/Whole county/);
    const slot = page.querySelector("[data-empty]");
    expect(slot?.getAttribute("data-empty")).toBe("true");
    expect(screen.getByText(/No centre chosen yet, so no results/)).not.toBeNull();
    expect(screen.queryByTestId("search-results")).toBeNull();
  });

  it("with a centre: results in the sheet, with the radius card in the map overlay", async () => {
    const page = renderAt("/?lat=30.4394&lng=-97.62&r=5");
    const list = await screen.findByTestId("search-results");
    const sheet = screen.getByRole("region", { name: "Results" });
    expect(sheet.contains(list)).toBe(true);
    expect(sheet.getAttribute("data-sheet")).toBe("peek");
    expect(page.querySelector("[data-empty]")?.getAttribute("data-empty")).toBe("false");
    expect(within(list).getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("spinbutton", { name: "Radius" })).not.toBeNull();
    expect(page.querySelector("[data-county-card]")).toBeNull();
  });

  it("zero results: the widen notice keeps its data-state and button inside the sheet", async () => {
    searchResult = { properties: [] };
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByText("Widen to 6 mi");
    const sheet = screen.getByRole("region", { name: "Results" });
    expect(sheet.contains(document.querySelector('[data-state="CrmMapNoResults390"]'))).toBe(true);
    expect(screen.getByRole("button", { name: "Widen to 6 mi" })).not.toBeNull();
  });

  it("zoomed out with loaded results: shows the overview chip, whose Zoom in zooms the map", async () => {
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    const chip = await screen.findByText("Zoomed out: median roof age per hexagon");
    expect(chip).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in to individual properties" }));
    expect(zoomToDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Median roof age per hexagon, yrs")).not.toBeNull();
  });

  it("zoomed in: no overview chip and the per-property legend", async () => {
    reportedMode = "detail";
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    expect(screen.queryByText("Zoomed out: median roof age per hexagon")).toBeNull();
    expect(screen.getByText("Roof age, yrs")).not.toBeNull();
  });

  it("sel opens the drawer (aside[data-property-cid]) in its own slot, outside the results sheet", async () => {
    renderAt(`/?lat=30.4394&lng=-97.62&r=5&sel=${property.propertyCid}`);
    // The first-visit card is also a dialog, so the drawer is picked out by its element.
    await screen.findByRole("dialog", { name: "What can I ask?" });
    const drawer = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>("aside[role='dialog'][data-property-cid]");
      if (found === null) throw new Error("drawer not rendered yet");
      return found;
    });
    expect(drawer.tagName).toBe("ASIDE");
    expect(drawer.getAttribute("data-property-cid")).toBe(property.propertyCid);
    const sheet = screen.getByRole("region", { name: "Results" });
    expect(sheet.contains(drawer)).toBe(false);
  });
});

describe("Map route first-visit card", () => {
  it("shows What can I ask? over the map area on the first visit, not once dismissed", async () => {
    localStorage.clear();
    const page = renderAt("/");
    const card = await screen.findByRole("dialog", { name: "What can I ask?" });
    expect(page.contains(card)).toBe(true);
    cleanup();
    localStorage.setItem("crm.whatCanIAsk.v1", "dismissed");
    renderAt("/");
    expect(screen.queryByRole("dialog", { name: "What can I ask?" })).toBeNull();
    localStorage.clear();
  });
});

describe("Map route county overview (search.countyOverview)", () => {
  it("with no centre, loads the whole county at the opening zoom and hands its cells to the map", async () => {
    renderAt("/");
    await screen.findByText(/Hexagons cover the whole county: 120 properties/);
    expect(overviewCalls[0]).toEqual({ zoom: 9, permits: true });
    expect(lastOverviewCells?.map((c) => c.count)).toEqual([120]);
    expect(lastOverviewPermits?.map((p) => p.permits)).toEqual([5]);
    expect(screen.getByText(/5 not on the map: no coordinates published/)).not.toBeNull();
    expect(screen.getByText(new RegExp(`Source: run ${RUN}`))).not.toBeNull();
    // The overview chip shows with county cells even before any pin.
    expect(screen.getByText("Zoomed out: median roof age per hexagon")).not.toBeNull();
  });

  it("re-asks with the map's whole-number zoom and the roof-age filter", async () => {
    renderAt("/?roof=15");
    await screen.findByText(/Hexagons cover the whole county/);
    reportZoomStep?.(10);
    await vi.waitFor(() =>
      expect(overviewCalls).toContainEqual({ zoom: 10, roofAgeMinYears: 15, permits: true }),
    );
  });

  it("in the marker view, shows no county note and stops re-asking on zoom", async () => {
    reportedMode = "detail";
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByTestId("search-results");
    const before = overviewCalls.length;
    reportZoomStep?.(8);
    await screen.findByText("Roof age, yrs");
    expect(overviewCalls).toHaveLength(before);
    expect(document.querySelector("[data-overview-state]")).toBeNull();
  });

  it("when the overview fails, says so and falls back to binning the loaded results", async () => {
    overviewFails = true;
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    await screen.findByText(/county overview could not be read/);
    expect(screen.getByText(/only the 1 properties loaded around your pin/)).not.toBeNull();
    expect(lastOverviewCells).toBeNull();
    expect(lastOverviewPermits).toBeNull();
  });

  it("when the search index is down, the notice says so and Retry asks again", async () => {
    searchFails = true;
    renderAt("/?lat=30.4394&lng=-97.62&r=5");
    const notice = await screen.findByText(/Lead index unavailable/);
    expect(notice.closest('[data-state="CrmMapIndexDown390"]')).not.toBeNull();
    expect(screen.getByText(/Your leads and notes still open/)).not.toBeNull();
    const before = searchCalls;
    searchFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("search-results");
    expect(searchCalls).toBeGreaterThan(before);
  });
});

describe("Map route pin mode, GPS and outside-county cards (boards CrmMapPinMode*, CrmMapGps*, CrmMapPinOutside390)", () => {
  const dropPinControl = (): HTMLElement => screen.getByRole("button", { name: "Drop pin" });

  it("the Drop pin control starts pin mode, with the board's words, and Cancel leaves it", () => {
    const page = renderAt("/");
    fireEvent.click(dropPinControl());
    const card = page.querySelector<HTMLElement>('[data-state="CrmMapPinMode390"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toMatch(/Move the map so the crosshair is on the spot/);
    expect(lastMapProps.pinMode).toBe(true);
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Cancel" }));
    expect(page.querySelector('[data-state="CrmMapPinMode390"]')).toBeNull();
    expect(lastMapProps.pinMode).toBe(false);
  });

  it("Place pin here drops the pin at the crosshair (the map's centre) and ends pin mode", () => {
    const page = renderAt("/");
    fireEvent.click(dropPinControl());
    fireEvent.click(screen.getByRole("button", { name: "Place pin here" }));
    expect(placeAtCenter).toHaveBeenCalledTimes(1);
    expect(page.querySelector('[data-state="CrmMapPinMode390"]')).toBeNull();
  });

  it("a pin outside the county says so on the map, once, and Go to Travis County shows the county", () => {
    const page = renderAt("/?lat=30.6333&lng=-97.678&r=5");
    const cards = page.querySelectorAll('[data-state="CrmMapPinOutside390"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toMatch(
      /This pin is outside Travis County\. The CRM covers Travis County only\./,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go to Travis County" }));
    expect(showCounty).toHaveBeenCalledTimes(1);
  });

  it("a GPS fix shows its card in the map's status stack and hands the map its accuracy circle", () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 30.4394, longitude: -97.62, accuracy: 12 },
          } as GeolocationPosition),
      },
    });
    const page = renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    const stack = page.querySelector("[data-map-status]");
    expect(stack?.querySelector('[data-state="CrmMapGps390"]')?.textContent).toMatch(
      /You are here \(±12 m\)/,
    );
    expect(lastMapProps.accuracy).toEqual({ meters: 12 });
    expect(screen.getByText(/From Your location \(GPS\)/)).not.toBeNull();
    // A pin dropped by hand is not a GPS fix: its accuracy circle goes away.
    delete (navigator as { geolocation?: unknown }).geolocation;
  });

  it("a low-accuracy fix says the ring's origin is approximate", () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 30.4394, longitude: -97.62, accuracy: 1600 },
          } as GeolocationPosition),
      },
    });
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(screen.getByText(/From Your location \(approximate\)/)).not.toBeNull();
    delete (navigator as { geolocation?: unknown }).geolocation;
  });
});
