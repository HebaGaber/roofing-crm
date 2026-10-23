// B-03 structural rebuild: ResultRow's card header (TCAD id + "Address not published" — this
// contract never publishes a street address yet, FU-A-01) and its distance-from-centre line
// (AC-1: real distance via packages/domain's distanceMeters, never a fake address from lat/lon).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { ResultRow } from "../src/routes/Map/ResultRow";

afterEach(cleanup);

function makePermit(overrides: Partial<Provenanced<CrmPermit>> = {}): Provenanced<CrmPermit> {
  return {
    propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
    permitCid: "bafkreipermitaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    jurisdiction: "Austin",
    permitNumber: "2020-062543",
    improvementType: "Reroof",
    improvementAction: "Replace",
    improvementStatus: "open",
    statusClass: "open",
    issueDate: "2026-09-04",
    finalDate: null,
    permitCloseDate: null,
    finalInspectionDate: null,
    openDays: 28,
    contractorResolution: "unresolved",
    contractorCompanyCid: null,
    sourceManifestCid: "bafkreimanifest",
    missingReasons: [],
    capturedAt: "2026-10-20T00:00:00Z",
    cid: "bafkreipermittablecid",
    runId: "run-3",
    ...overrides,
  };
}

function makeRow(overrides: Partial<Provenanced<CrmProperty>> = {}): Provenanced<CrmProperty> {
  return {
    propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaq4xa",
    requestIdentifier: "0201885122",
    latitude: 30.46,
    longitude: -97.6,
    coordinateSource: "gis_centroid",
    propertyType: "Residential",
    propertyUsageType: null,
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
    ...overrides,
  };
}

describe("ResultRow card", () => {
  it("shows the TCAD id and 'Address not published' instead of a fabricated address", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.getByText("TCAD 0201885122")).not.toBeNull();
    expect(screen.getByText(/Address not published/)).not.toBeNull();
  });

  it("shows real distance from the search centre when one is given (AC-1)", () => {
    render(<ResultRow row={makeRow()} center={{ lat: 30.4394, lng: -97.62 }} />);
    // ~2 mi between (30.46, -97.6) and (30.4394, -97.62) by the haversine great-circle distance.
    expect(screen.getByText(/mi$/)).not.toBeNull();
  });

  it("renders no distance when no search centre is set", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.queryByText(/mi$/)).toBeNull();
  });

  it("shows a roof-age badge with its confidence", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.getByText("Roof 20 yrs")).not.toBeNull();
    expect(screen.getByText("Confidence high")).not.toBeNull();
  });

  it("shows 'Type not published' when propertyType is null, never blank", () => {
    render(<ResultRow row={makeRow({ propertyType: null })} />);
    expect(screen.getByText("Type not published")).not.toBeNull();
  });

  it("shows the honest roof-age-not-available fallback when roofAgeYears is null with no matching missingReasons entry (GAP-4b)", () => {
    render(<ResultRow row={makeRow({ roofAgeYears: null })} />);
    expect(screen.getByText("Roof age not available")).not.toBeNull();
  });

  it("shows the MissingReason component's reason text when a missingReasons entry exists for the null roof age", () => {
    render(
      <ResultRow
        row={makeRow({
          roofAgeYears: null,
          missingReasons: [{ field: "roofAgeYears", reason: "no_roof_date" }],
        })}
      />,
    );
    // Rendered in more than one place (the badge row, PropertyFields, and the missing-data
    // summary all independently surface the same missingReasons entry) — assert it appears at
    // all, not an exact count tied to internal layout.
    expect(screen.getAllByText("No roof date found").length).toBeGreaterThan(0);
  });

  it("groups and shows every missingReasons entry (constitution XI)", () => {
    render(
      <ResultRow
        row={makeRow({
          missingReasons: [
            { field: "propertyUsageType", reason: "source_missing" },
            { field: "ownerKind", reason: "source_missing" },
          ],
        })}
      />,
    );
    expect(screen.getByLabelText("Missing data")).not.toBeNull();
    expect(screen.getByText("propertyUsageType, ownerKind")).not.toBeNull();
  });

  it("renders a PermitChip per permit when the permit-view prop is populated (AC-5), nothing when empty or absent", () => {
    const { rerender } = render(
      <ResultRow row={makeRow()} permits={[makePermit({ openDays: 1900 })]} />,
    );
    expect(screen.getByLabelText("Permits")).not.toBeNull();
    expect(screen.getByText("Long-open")).not.toBeNull();

    rerender(<ResultRow row={makeRow()} permits={[]} />);
    expect(screen.queryByLabelText("Permits")).toBeNull();

    rerender(<ResultRow row={makeRow()} />);
    expect(screen.queryByLabelText("Permits")).toBeNull();
  });

  it("calls onSelect when the row is clicked, but not when a permit chip/link inside it is clicked", () => {
    const onSelect = vi.fn();
    render(<ResultRow row={makeRow()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("article"));
    expect(onSelect).toHaveBeenCalledWith(makeRow().propertyCid);
  });

  it("calls onSelect on Enter and Space when the row itself is focused, and shows an 'Open details' button", () => {
    const onSelect = vi.fn();
    render(<ResultRow row={makeRow()} onSelect={onSelect} selected />);
    const row = screen.getByRole("article");
    fireEvent.keyDown(row, { key: "Enter", target: row });
    fireEvent.keyDown(row, { key: " ", target: row });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Open details" })).not.toBeNull();
  });

  it("renders no 'Open details' button and never calls onSelect when onSelect is omitted", () => {
    render(<ResultRow row={makeRow()} />);
    expect(screen.queryByRole("button", { name: "Open details" })).toBeNull();
  });
});
