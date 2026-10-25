// B-07 T019: the lead list's URL-state codec (mirrors Map/ExploreFilters.state.ts). AC-4: a filter
// combination is shareable and restorable from the URL; out-of-bounds values are dropped, never
// clamped into a different question.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAD_RADIUS_MI,
  activeFilterCount,
  leadsMapHref,
  parseLeadQuery,
  patchLeadParams,
  toLeadsListInput,
} from "../../src/routes/Leads/leadFilters.state";

describe("leadFilters.state", () => {
  it("round-trips roof-age, permit status, radius and center through query params", () => {
    const params = patchLeadParams(new URLSearchParams(), {
      roof: 20,
      permit: "stalled",
      r: 7.5,
      lat: 30.2672,
      lng: -97.7431,
    });
    const reopened = parseLeadQuery(new URLSearchParams(params.toString()));
    expect(reopened).toMatchObject({
      roofAgeMinYears: 20,
      permitStatus: "stalled",
      radiusMi: 7.5,
      center: { lat: 30.2672, lng: -97.7431 },
    });
  });

  it("returns an empty query (no filters) for an empty URL", () => {
    const q = parseLeadQuery(new URLSearchParams());
    expect(q.roofAgeMinYears).toBeUndefined();
    expect(q.permitStatus).toBeUndefined();
    expect(q.center).toBeNull();
    expect(q.radiusMi).toBe(DEFAULT_LEAD_RADIUS_MI);
  });

  it("drops invalid values instead of clamping or defaulting them into a filter", () => {
    const q = parseLeadQuery(
      new URLSearchParams("roof=-3&permit=bogus&r=999&lat=200&lng=10&status=nope"),
    );
    expect(q.roofAgeMinYears).toBeUndefined();
    expect(q.permitStatus).toBeUndefined();
    expect(q.center).toBeNull();
    expect(q.status).toBeUndefined();
  });

  it("removes a key when the patch value is null, and drops the cursor when a filter changes", () => {
    const start = new URLSearchParams("roof=15&cursor=abc");
    const next = patchLeadParams(start, { roof: null });
    expect(next.has("roof")).toBe(false);
    expect(next.has("cursor")).toBe(false);
  });

  it("keeps the cursor when only the cursor changes", () => {
    const next = patchLeadParams(new URLSearchParams("roof=15"), { cursor: "abc" });
    expect(next.get("cursor")).toBe("abc");
    expect(next.get("roof")).toBe("15");
  });

  it("builds the leads.list input: radius is only sent together with a center", () => {
    const withCenter = toLeadsListInput(
      parseLeadQuery(new URLSearchParams("roof=15&permit=open&r=5&lat=30.2&lng=-97.7&status=new")),
    );
    expect(withCenter).toEqual({
      filters: {
        roofAgeMinYears: 15,
        permitStatus: "open",
        radiusMi: 5,
        centerLat: 30.2,
        centerLon: -97.7,
      },
      status: "new",
      limit: 25,
    });
    const noCenter = toLeadsListInput(parseLeadQuery(new URLSearchParams("r=5")));
    expect(noCenter.filters?.radiusMi).toBeUndefined();
  });

  it("drops permit=closed: the CRM's permit filter is Open, Stalled or Any (design-review-log row 6)", () => {
    expect(parseLeadQuery(new URLSearchParams("permit=closed")).permitStatus).toBeUndefined();
    expect(parseLeadQuery(new URLSearchParams("permit=open")).permitStatus).toBe("open");
    expect(parseLeadQuery(new URLSearchParams("permit=stalled")).permitStatus).toBe("stalled");
  });

  it("counts active filters, the area and its radius counting once", () => {
    expect(activeFilterCount(parseLeadQuery(new URLSearchParams()))).toBe(0);
    expect(activeFilterCount(parseLeadQuery(new URLSearchParams("r=10")))).toBe(0);
    expect(
      activeFilterCount(
        parseLeadQuery(
          new URLSearchParams("status=new&assignee=a&roof=20&permit=open&lat=30.2&lng=-97.7&r=10"),
        ),
      ),
    ).toBe(5);
  });

  it("Show on map carries only the keys the map reads: area, radius, roof age, permit layer", () => {
    expect(leadsMapHref(parseLeadQuery(new URLSearchParams()))).toBe("/map");
    const href = leadsMapHref(
      parseLeadQuery(
        new URLSearchParams("status=won&assignee=a&roof=20&permit=open&lat=30.2&lng=-97.7&r=10"),
      ),
    );
    const [path, search] = href.split("?");
    expect(path).toBe("/map");
    const params = new URLSearchParams(search);
    expect(Object.fromEntries(params)).toEqual({
      lat: "30.2",
      lng: "-97.7",
      r: "10",
      roof: "20",
      permits: "1",
    });
    // No area: the radius is not sent on its own.
    expect(leadsMapHref(parseLeadQuery(new URLSearchParams("r=10&roof=15")))).toBe("/map?roof=15");
  });
});
