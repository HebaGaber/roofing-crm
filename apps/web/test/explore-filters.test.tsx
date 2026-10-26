// B-03 Map URL state tests (tasks.md T025a; FR-001, FR-003, FR-005). Replaces the A-13/ORACLE-u
// version this file was copied from (C1 copy, 2026-10-23), which exercised that story's whole
// place-based Explore route (search mocking, gazetteer, React Query) — none of which exists in
// this story (B-03's Map has no place search; `ExploreFilters.state.ts` is now pure URL-state
// parsing with no route or API dependency of its own, so these are plain unit tests, not a
// rendered-route test).
import { describe, expect, it } from "vitest";
import { DEFAULT_ROOF_AGE_YEARS } from "@crm/domain";
import {
  DEFAULT_RADIUS_MI,
  parseMapQuery,
  patchMapParams,
} from "../src/routes/Map/ExploreFilters.state";

function params(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe("parseMapQuery", () => {
  it("restores center, radius and roof-age threshold from the URL", () => {
    const query = parseMapQuery(params("lat=30.4394&lng=-97.62&r=6&roof=15"));
    expect(query.center).toEqual({ lat: 30.4394, lng: -97.62 });
    expect(query.radiusMi).toBe(6);
    expect(query.roofAgeMinYears).toBe(15);
  });

  it("defaults to no center and the default radius when the URL has none", () => {
    const query = parseMapQuery(params(""));
    expect(query.center).toBeNull();
    expect(query.radiusMi).toBe(DEFAULT_RADIUS_MI);
    expect(query.roofAgeMinYears).toBeUndefined();
  });

  it("FR-001: drops a radius outside 0.5-25, never clamps it into a different value silently kept", () => {
    expect(parseMapQuery(params("r=0.4")).radiusMi).toBe(DEFAULT_RADIUS_MI);
    expect(parseMapQuery(params("r=25.5")).radiusMi).toBe(DEFAULT_RADIUS_MI);
    expect(parseMapQuery(params("r=25")).radiusMi).toBe(25);
    expect(parseMapQuery(params("r=0.5")).radiusMi).toBe(0.5);
  });

  it("drops an out-of-range lat/lng, falling back to no center", () => {
    expect(parseMapQuery(params("lat=400&lng=-97.62")).center).toBeNull();
  });

  it("restores the permit-view toggle and the selected property cid", () => {
    const query = parseMapQuery(params("permits=1&sel=bafkreiaaa"));
    expect(query.permitView).toBe(true);
    expect(query.sel).toBe("bafkreiaaa");
  });

  it("DEFAULT_ROOF_AGE_YEARS stays 15, the one named threshold constant (packages/domain)", () => {
    expect(DEFAULT_ROOF_AGE_YEARS).toBe(15);
  });

  it("drops an invalid/out-of-bounds roof-age value (undefined, never clamped to the default)", () => {
    // header comment's own rule: "values outside bounds are dropped, never clamped into a
    // different question" — a negative or non-integer `roof` must not silently become
    // DEFAULT_ROOF_AGE_YEARS's filter (found in review, CR-B-03).
    expect(parseMapQuery(params("roof=-5")).roofAgeMinYears).toBeUndefined();
    expect(parseMapQuery(params("roof=abc")).roofAgeMinYears).toBeUndefined();
    expect(parseMapQuery(params("roof=1.5")).roofAgeMinYears).toBeUndefined();
  });
});

describe("patchMapParams", () => {
  it("sets a value", () => {
    const next = patchMapParams(params(""), { r: 6 });
    expect(next.get("r")).toBe("6");
  });

  it("removes a key when the patch value is null/undefined/false", () => {
    const next = patchMapParams(params("permits=1"), { permits: null });
    expect(next.has("permits")).toBe(false);
  });

  it("writes a boolean true as '1'", () => {
    const next = patchMapParams(params(""), { permits: true });
    expect(next.get("permits")).toBe("1");
  });

  it("never mutates the input URLSearchParams", () => {
    const original = params("r=5");
    patchMapParams(original, { r: 10 });
    expect(original.get("r")).toBe("5");
  });
});

describe("owner filters in the URL (tenure, ooa)", () => {
  it("restores tenure and ooa", () => {
    const q = parseMapQuery(params("tenure=10&ooa=1"));
    expect(q.tenureYearsMin).toBe(10);
    expect(q.outOfArea).toBe(true);
    expect(parseMapQuery(params("ooa=true")).outOfArea).toBe(true);
    expect(parseMapQuery(params("tenure=0")).tenureYearsMin).toBe(0);
    expect(parseMapQuery(params("tenure=100")).tenureYearsMin).toBe(100);
  });

  it("defaults to off", () => {
    const q = parseMapQuery(params(""));
    expect(q.tenureYearsMin).toBeUndefined();
    expect(q.outOfArea).toBe(false);
  });

  it("drops invalid values, never clamps", () => {
    for (const bad of ["-1", "101", "1.5", "abc", "", "1e2x"]) {
      expect(parseMapQuery(params(`tenure=${bad}`)).tenureYearsMin).toBeUndefined();
    }
    for (const bad of ["0", "yes", "2", ""]) {
      expect(parseMapQuery(params(`ooa=${bad}`)).outOfArea).toBe(false);
    }
  });

  it("patches, removes and round-trips", () => {
    const set = patchMapParams(params("roof=15"), { tenure: 10, ooa: true });
    expect(set.get("tenure")).toBe("10");
    expect(set.get("ooa")).toBe("1");
    expect(set.get("roof")).toBe("15");
    const q = parseMapQuery(set);
    expect([q.tenureYearsMin, q.outOfArea, q.roofAgeMinYears]).toEqual([10, true, 15]);
    const zero = patchMapParams(params(""), { tenure: 0 });
    expect(zero.get("tenure")).toBe("0");
    const cleared = patchMapParams(set, { tenure: null, ooa: null });
    expect(cleared.has("tenure")).toBe(false);
    expect(cleared.has("ooa")).toBe(false);
    expect(patchMapParams(set, { ooa: false }).has("ooa")).toBe(false);
  });
});
