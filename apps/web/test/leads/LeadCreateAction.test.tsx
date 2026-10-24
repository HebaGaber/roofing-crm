// B-07 T022 (deviation: RTL instead of Playwright component test, as apps/web has no Playwright
// component setup): LeadCreateAction wired into the PropertyDetail drawer calls leads.create and
// shows "Already a lead" on ALREADY_EXISTS (AC-1/AC-2).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

const mutate = vi.fn();
let mutationState: { isPending: boolean; isSuccess: boolean; error: unknown } = {
  isPending: false,
  isSuccess: false,
  error: null,
};
vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useCreateLead: () => ({ mutate, ...mutationState }),
}));

import { toCreateInput } from "../../src/routes/Leads/LeadCreateAction";
import {
  PropertyDetail,
  type PropertyDetailData,
} from "../../src/routes/Map/PropertyDetail/PropertyDetail";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  mutationState = { isPending: false, isSuccess: false, error: null };
});

const property = {
  propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
  requestIdentifier: "0201885122",
  latitude: 30.27,
  longitude: -97.74,
  coordinateSource: "gis_centroid",
  propertyType: "Residential",
  propertyUsageType: null,
  roofAgeYears: 23,
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
} as unknown as Provenanced<CrmProperty>;

const data: PropertyDetailData = {
  property,
  permits: [],
  bbbStatus: null,
  bbbStatusReason: null,
  lineageUrl: "https://example.com/lineage",
};

function renderDrawer(): void {
  render(
    <MemoryRouter>
      <PropertyDetail data={data} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("LeadCreateAction in the PropertyDetail drawer", () => {
  it("calls leads.create with the property's key fields and snapshot", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /create lead/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      fips: "48453",
      requestIdentifier: "0201885122",
      lat: 30.27,
      lon: -97.74,
      sourceManifestCid: "bafkreimanifest",
      createdFrom: "map",
      signals: { roofAgeYears: 23, roofAgeBasis: "permit" },
    });
  });

  it("shows 'Already a lead' (not an error) when create fails with ALREADY_EXISTS", () => {
    mutationState = {
      isPending: false,
      isSuccess: false,
      error: { data: { appCode: "ALREADY_EXISTS" }, message: "exists" },
    };
    renderDrawer();
    expect(screen.getByText(/already a lead/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /create lead/i })).toBeNull();
  });

  it("shows a retryable error for any other failure", () => {
    mutationState = { isPending: false, isSuccess: false, error: new Error("boom") };
    renderDrawer();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /create lead/i })).toBeTruthy();
  });

  it("confirms creation after success with a link to the lead list", () => {
    mutationState = { isPending: false, isSuccess: true, error: null };
    renderDrawer();
    expect(screen.getByText(/lead created/i)).toBeTruthy();
  });
});

// AC-1 / TC-002 / TC-003: the snapshot holds the permit; a rep can create from a permit row.
const permit = (over: Partial<Provenanced<CrmPermit>>): Provenanced<CrmPermit> =>
  ({
    propertyCid: property.propertyCid,
    permitCid: "bafkreipermit1",
    permitNumber: "2025-100",
    statusClass: "open",
    openDays: 340,
    contractorResolution: "unresolved",
    improvementType: "roof",
    improvementAction: "replace",
    issueDate: "2025-01-01",
    finalDate: null,
    capturedAt: "2026-10-20T00:00:00Z",
    cid: "bafkreipermitcid",
    runId: "run-3",
    ...over,
  }) as unknown as Provenanced<CrmPermit>;

describe("signals snapshot holds the permit", () => {
  const closed = permit({ permitCid: "c", permitNumber: "2020-1", statusClass: "closed" });
  const open = permit({ permitCid: "o" });

  it("defaults to the first open permit (id and open days); never invents a contractor", () => {
    const input = toCreateInput(property, [closed, open]);
    expect(input?.signals).toMatchObject({ openPermitId: "2025-100", openDays: 340 });
    expect(input?.signals).not.toHaveProperty("contractor");
  });

  it("has no permit fields when no permit is open, and omits null number/days", () => {
    expect(toCreateInput(property, [closed])?.signals).not.toHaveProperty("openPermitId");
    const bare = permit({ permitNumber: null, openDays: null });
    const signals = toCreateInput(property, [bare])?.signals;
    expect(signals).not.toHaveProperty("openPermitId");
    expect(signals).not.toHaveProperty("openDays");
  });

  it("an explicit permit wins over the first open one", () => {
    const input = toCreateInput(property, [open], closed);
    expect(input?.signals).toMatchObject({ openPermitId: "2020-1", openDays: 340 });
  });

  it("each permit card has its own 'Create lead from permit' button; the header one stays 'Create lead'", () => {
    render(
      <MemoryRouter>
        <PropertyDetail data={{ ...data, permits: [closed, open] }} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("button", { name: "Create lead" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Create lead from permit 2020-1" }));
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      requestIdentifier: "0201885122",
      signals: { openPermitId: "2020-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(mutate.mock.calls[1]?.[0]).toMatchObject({ signals: { openPermitId: "2025-100" } });
  });
});
