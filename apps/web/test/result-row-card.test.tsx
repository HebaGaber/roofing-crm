// B-03 structural rebuild: ResultRow's card header (TCAD id + "Address not published" — this
// contract never publishes a street address yet, FU-A-01) and its distance-from-centre line
// (AC-1: real distance via packages/domain's distanceMeters, never a fake address from lat/lon).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CrmProperty, Provenanced } from "@crm/index-schema";
import { ResultRow } from "../src/routes/Map/ResultRow";

afterEach(cleanup);

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
});
