// PropertyDetail drawer (CrmProperty390/768/1440, CrmPropertyNoAddress*): the header, Create lead
// near the top, and every value formatted (dates, enum codes, field names never shown raw), with
// provenance kept visible.
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }),
  usePrefetchLeadsList: () => () => Promise.resolve(),
}));

import {
  PropertyDetail,
  type PropertyDetailData,
} from "../../src/routes/Map/PropertyDetail/PropertyDetail";

afterEach(cleanup);

const property = {
  propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
  requestIdentifier: "192820",
  latitude: 30.2655,
  longitude: -97.743,
  coordinateSource: "gis_centroid",
  propertyType: "Building",
  propertyUsageType: null,
  roofAgeYears: 41,
  roofAgeBasis: "built_year",
  roofAgeConfidence: "low",
  isLongTenure: null,
  ownerKind: null,
  ownerAreaClass: null,
  ownerIsOutOfArea: null,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [
    { field: "unnormalized_address", reason: "not_in_export" },
    { field: "city_name", reason: "not_in_export" },
  ],
  capturedAt: "2026-10-21T10:40:04Z",
  cid: "bafkreitablecid",
  runId: "travis-202609-permits-20261021t103516z",
} as unknown as Provenanced<CrmProperty>;

const permit = {
  propertyCid: property.propertyCid,
  permitCid: "bafkreipermitaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  jurisdiction: "Austin",
  permitNumber: "2026-115882 BP",
  improvementType: "Roofing",
  improvementAction: "Replace",
  improvementStatus: "open",
  statusClass: "open",
  issueDate: "2026-09-04T00:00:00.000Z",
  finalDate: null,
  permitCloseDate: null,
  finalInspectionDate: null,
  openDays: 47,
  contractorResolution: "unresolved",
  contractorCompanyCid: null,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [],
  capturedAt: "2026-10-21T10:35:59Z",
  cid: "bafkreipermittablecid",
  runId: "travis-202609-permits-20261021t103516z",
} as unknown as Provenanced<CrmPermit>;

const data: PropertyDetailData = {
  property,
  permits: [permit],
  bbbStatus: null,
  bbbStatusReason: null,
  lineageUrl: "https://example.com/lineage",
};

function renderDrawer(d: PropertyDetailData = data): HTMLElement {
  render(
    <MemoryRouter>
      <PropertyDetail data={d} onClose={() => undefined} />
    </MemoryRouter>,
  );
  return screen.getByRole("dialog");
}

describe("PropertyDetail drawer", () => {
  it("keeps the e2e hooks: an aside dialog carrying the property CID", () => {
    const drawer = renderDrawer();
    expect(drawer.tagName).toBe("ASIDE");
    expect(drawer?.getAttribute("data-property-cid")).toBe(property.propertyCid);
  });

  it("titles the drawer with the TCAD id and says the address is not published", () => {
    renderDrawer();
    expect(screen.getByRole("heading", { level: 3 })?.textContent).toContain("TCAD 192820");
    expect(
      screen.getByText(/Address not published in this run · 30\.26550, -97\.74300/),
    ).not.toBeNull();
  });

  it("shows the usage type, or 'Type not published' — never the structure form 'Building'", () => {
    renderDrawer();
    expect(screen.getByText("Type not published")).not.toBeNull();
    expect(screen.queryByText("Building")).toBeNull();
  });

  it("puts the property's Create lead before the Roof section", () => {
    const drawer = renderDrawer();
    const create = within(drawer).getByRole("button", { name: "Create lead" });
    const roof = within(drawer).getByRole("heading", { name: "Roof" });
    expect(create.compareDocumentPosition(roof) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("formats roof values: years, basis and confidence as plain labels", () => {
    renderDrawer();
    expect(document.querySelector('[data-field="roof_age_years"]')?.textContent).toMatch(
      /^41 yrs$/,
    );
    expect(document.querySelector('[data-field="roof_age_basis"]')?.textContent).toContain(
      "Year built (no reroof permit found)",
    );
    expect(document.querySelector('[data-field="roof_age_confidence"]')?.textContent).toContain(
      "Low",
    );
    expect(screen.queryByText("built_year")).toBeNull();
  });

  it("formats permit dates and status: no ISO timestamps, no raw codes", () => {
    const drawer = renderDrawer();
    expect(drawer.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(screen.getByText(/Sep 4, 2026/)).not.toBeNull();
    expect(screen.getByText("Open")).not.toBeNull();
    expect(screen.queryByText("open")).toBeNull();
  });

  it("lists missing fields in plain language with the contract's reason", () => {
    renderDrawer();
    expect(screen.getByText("Street address, city")).not.toBeNull();
    expect(screen.queryByText(/unnormalized_address/)).toBeNull();
    expect(screen.getAllByText("Not included in the published tables").length).toBeGreaterThan(0);
  });

  it("keeps provenance visible: run id and captured time for the property and each permit", () => {
    renderDrawer();
    expect(screen.getAllByText(/run travis-202609-permits-20261021t103516z/).length).toBe(2);
  });

  it("says why when the property is not in this run", () => {
    renderDrawer({ ...data, property: null, permits: [] });
    expect(screen.getByRole("heading", { level: 3 })?.textContent).toContain(
      "Property not in this run",
    );
  });
});

describe("PropertyDetail drawer · near {place} (E-93)", () => {
  const SHA = "a".repeat(64);
  const withPlace: PropertyDetailData = {
    ...data,
    nearPlace: {
      name: "Pflugerville",
      distanceMi: 1.4,
      source: "travis-places@1.0.0",
      sha256: SHA,
    },
  };

  it("titles the drawer 'TCAD {id} · near {place}'", () => {
    renderDrawer(withPlace);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toContain("TCAD 192820 · near Pflugerville");
    expect(heading.textContent).not.toContain(" in Pflugerville");
  });

  it("shows the gazetteer as the place's provenance on hover", () => {
    renderDrawer(withPlace);
    const place = document.querySelector('[data-field="near_place"]');
    expect(place?.textContent).toBe("near Pflugerville");
    const title = place?.getAttribute("title") ?? "";
    expect(title).toContain("1.4 mi");
    expect(title).toContain("travis-places@1.0.0");
    expect(title).toContain(SHA);
  });

  it("keeps the address line and the e2e hooks with a place in the title", () => {
    const drawer = renderDrawer(withPlace);
    expect(drawer.getAttribute("data-property-cid")).toBe(property.propertyCid);
    expect(
      screen.getByText(/Address not published in this run · 30\.26550, -97\.74300/),
    ).not.toBeNull();
  });

  it("with no coordinates: no place, and the contract's reason says why", () => {
    const noCoords = {
      ...property,
      latitude: null,
      longitude: null,
      missingReasons: [
        ...property.missingReasons,
        { field: "latitude", reason: "no_coordinates" },
        { field: "longitude", reason: "no_coordinates" },
      ],
    } as unknown as Provenanced<CrmProperty>;
    renderDrawer({ ...data, property: noCoords });
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).toContain("TCAD 192820");
    expect(heading.textContent).not.toContain("near");
    const reason = document.querySelector('[data-field="near_place"]');
    expect(reason?.textContent).toContain("Nearest place not shown");
    expect(reason?.textContent).toContain("No coordinates for this parcel");
  });
});
