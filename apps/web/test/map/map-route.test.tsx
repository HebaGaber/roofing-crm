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
let reportedMode: "overview" | "detail" = "overview";

vi.mock("../../src/components/Map/CrmMap.js", () => ({
  CrmMap: forwardRef(function StubMap(
    props: { onViewModeChange?: (mode: "overview" | "detail") => void },
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      recenter: vi.fn(),
      zoomToDetail,
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

const opts = (key: string, fn: () => unknown) => (input: unknown) => ({
  queryKey: [key, input],
  queryFn: async () => fn(),
});

vi.mock("@crm/api-client/react", () => ({
  useTRPC: () => ({
    search: {
      properties: { queryOptions: opts("search.properties", () => searchResult) },
      permits: { queryOptions: opts("search.permits", () => ({ permits: [] })) },
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
    const drawer = await screen.findByRole("dialog");
    expect(drawer.tagName).toBe("ASIDE");
    expect(drawer.getAttribute("data-property-cid")).toBe(property.propertyCid);
    const sheet = screen.getByRole("region", { name: "Results" });
    expect(sheet.contains(drawer)).toBe(false);
  });
});
