import { describe, expect, it } from "vitest";
import {
  buildCandidates,
  compassBearing,
  defaultSort,
  leadsByRequestIdentifier,
  lowerRoofPreset,
  mainSignalText,
  permitSignalText,
  sortCandidates,
  whyChips,
} from "../../src/routes/Map/Candidates/candidates";
import { candidates, FILTERS, must, permit, property } from "./fixtures";

describe("compassBearing", () => {
  const c = { lat: 30.4, lng: -97.6 };
  it("names the eight directions", () => {
    expect(compassBearing(c, { lat: 30.5, lng: -97.6 })).toBe("N");
    expect(compassBearing(c, { lat: 30.3, lng: -97.6 })).toBe("S");
    expect(compassBearing(c, { lat: 30.4, lng: -97.5 })).toBe("E");
    expect(compassBearing(c, { lat: 30.4, lng: -97.7 })).toBe("W");
  });
});

describe("leadsByRequestIdentifier", () => {
  it("keys leads by the TCAD request identifier inside the lead key", () => {
    const map = leadsByRequestIdentifier([
      { leadKey: "48453:tcad:0201885121", leadId: "L1", status: "new" },
    ]);
    expect(map.get("0201885121")?.leadId).toBe("L1");
  });
});

describe("buildCandidates", () => {
  it("marks properties that are already leads (E-52)", () => {
    const list = candidates(
      [property(1), property(2)],
      [],
      [{ leadKey: "48453:tcad:0201885122", leadId: "L9", status: "contacted" }],
    );
    expect(list[0]?.lead).toBeNull();
    expect(list[1]?.lead?.status).toBe("contacted");
  });

  it("picks the longest-open open-or-stalled permit as the main signal", () => {
    const list = candidates(
      [property(1)],
      [
        permit(1, { permitCid: "a".repeat(59), openDays: 900, statusClass: "open" }),
        permit(1, { permitCid: "b".repeat(59), openDays: 2300, statusClass: "stalled" }),
        permit(1, { permitCid: "c".repeat(59), openDays: 5000, statusClass: "closed" }),
      ],
    );
    expect(list[0]?.mainPermit?.openDays).toBe(2300);
  });

  it("drops properties without a matching permit when a permit filter is on", () => {
    const filters = { ...FILTERS, permitStatus: "stalled" as const };
    const list = candidates([property(1), property(2)], [permit(1)], [], filters);
    expect(list).toHaveLength(1);
    expect(defaultSort(filters)).toBe("open");
  });

  it("applies permit open years to permits, not to roofs", () => {
    const filters = { ...FILTERS, permitOpenYrs: 7 };
    const list = candidates([property(1)], [permit(1, { openDays: 2300 })], [], filters);
    expect(list).toHaveLength(0); // 2300 days ≈ 6.3 yrs
  });

  it("keeps a null location as null distance, never 0", () => {
    const list = candidates([property(1, { latitude: null, longitude: null })]);
    expect(list[0]?.distanceMi).toBeNull();
    expect(list[0]?.bearing).toBeNull();
  });

  it("computes real distance and bearing from the centre", () => {
    const list = buildCandidates([property(1)], [], new Map(), {
      ...FILTERS,
      center: { lat: 30.4, lng: -97.6 },
    });
    expect(list[0]?.distanceMi).toBeGreaterThan(0.5);
    expect(list[0]?.bearing).toMatch(/^(N|NE|NW)$/);
  });
});

describe("sortCandidates", () => {
  it("sorts by roof age oldest first and puts unknown roofs last", () => {
    const list = candidates([
      property(1, { roofAgeYears: 17 }),
      property(2, { roofAgeYears: null }),
      property(3, { roofAgeYears: 30 }),
    ]);
    const ids = sortCandidates(list, "roof").map((c) => c.property.roofAgeYears);
    expect(ids).toEqual([30, 17, null]);
  });

  it("sorts by permit open longest, then nearest", () => {
    const list = candidates(
      [property(1), property(2)],
      [permit(1, { openDays: 2000 }), permit(2, { openDays: 3000 })],
    );
    expect(sortCandidates(list, "open")[0]?.property.requestIdentifier).toBe("0201885122");
    const near = sortCandidates(list, "near");
    expect(near[0]?.distanceMi ?? 99).toBeLessThanOrEqual(near[1]?.distanceMi ?? 0);
  });
});

describe("signal text", () => {
  it("labels stalled as derived (design-review-log row 6)", () => {
    expect(permitSignalText({ statusClass: "stalled", openDays: 2340 })).toBe(
      "Stalled 6.4 yrs · derived: no status in source",
    );
    expect(permitSignalText({ statusClass: "open", openDays: 1400 })).toBe("Open 3.8 yrs");
  });

  it("says the open duration is not published instead of inventing it", () => {
    expect(permitSignalText({ statusClass: "open", openDays: null })).toContain("not published");
  });

  it("main signal is the permit when there is one, else the roof", () => {
    const [withPermit] = candidates([property(1)], [permit(1)]);
    const [roofOnly] = candidates([property(1)]);
    expect(mainSignalText(must(withPermit))).toMatch(/^Permit Stalled 6\.3 yrs/);
    expect(mainSignalText(must(roofOnly))).toBe("Roof 16 yrs · High confidence");
  });

  it("builds Why is this a lead? from what the row meets", () => {
    const [c] = candidates([property(1)], [permit(1)]);
    const chips = whyChips(must(c), FILTERS);
    expect(chips[0]).toBe("Roof 16 yrs ≥ 15 · High confidence");
    expect(chips.some((x) => x.startsWith("Stalled"))).toBe(true);
    expect(chips.at(-1)).toMatch(/mi ≤ 5 mi$/);
  });
});

describe("lowerRoofPreset", () => {
  it("steps down to the next preset and stops at the lowest", () => {
    expect(lowerRoofPreset(15)).toBe(13);
    expect(lowerRoofPreset(10)).toBeNull();
    expect(lowerRoofPreset(undefined)).toBeNull();
  });
});
