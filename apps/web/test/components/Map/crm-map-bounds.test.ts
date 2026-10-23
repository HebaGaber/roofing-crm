// T012: write first, confirm it fails (no bounds helper exists yet). Asserts minZoom is derived
// from cameraForBounds on the Travis County bbox (≈30.09–30.52°N, −98.17–−97.33°W) and that no
// maxBounds is set (research.md, agent-design.md §3).
import { describe, expect, it } from "vitest";
import {
  TRAVIS_COUNTY_BOUNDS,
  buildMapInitOptions,
  computeMinZoom,
  type CameraForBoundsMap,
} from "../../../src/components/Map/bounds.js";

describe("CrmMap bounds helper (T012)", () => {
  it("computeMinZoom calls cameraForBounds with the Travis County bbox and returns its zoom", () => {
    const calls: unknown[] = [];
    const fakeMap: CameraForBoundsMap = {
      cameraForBounds: (bounds) => {
        calls.push(bounds);
        return { zoom: 9.4 };
      },
    };
    expect(computeMinZoom(fakeMap)).toBe(9.4);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(TRAVIS_COUNTY_BOUNDS);
  });

  it("the Travis County bbox is approximately 30.09–30.52°N, -98.17–-97.33°W", () => {
    const [[swLng, swLat], [neLng, neLat]] = TRAVIS_COUNTY_BOUNDS;
    expect(swLat).toBeCloseTo(30.09, 1);
    expect(neLat).toBeCloseTo(30.52, 1);
    expect(swLng).toBeCloseTo(-98.17, 1);
    expect(neLng).toBeCloseTo(-97.33, 1);
  });

  it("returns undefined rather than guessing when cameraForBounds can't compute one", () => {
    const fakeMap: CameraForBoundsMap = { cameraForBounds: () => null };
    expect(computeMinZoom(fakeMap)).toBeUndefined();
  });

  it("buildMapInitOptions sets no maxBounds (AC-2: no artificial pan/zoom limit)", () => {
    const options = buildMapInitOptions();
    expect(options).not.toHaveProperty("maxBounds");
    expect(options.center).toEqual([-97.7431, 30.2672]);
  });
});
