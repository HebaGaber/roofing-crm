import { describe, expect, it } from "vitest";
import {
  ADDRESS_UNAVAILABLE_REASON,
  GAZETTEER_PROVENANCE,
  SEARCH_SAMPLES,
  addressSource,
  classifyQuery,
  normalisePermit,
  optionsFor,
  suggestFromGazetteer,
} from "../../src/routes/Map/searchSuggest";

describe("classifyQuery", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["Pflugerville", "place"],
    ["round rock", "place"],
    ["787", "zip"],
    ["78660", "zip"],
    ["zip 78660", "zip"],
    ["138273", "tcad"],
    ["12345678", "tcad"],
    ["123456789", "place"],
    ["2026-121002 BP", "permit"],
    ["2026-121002", "permit"],
    ["2026-121002bp", "permit"],
    ["2026-12100", "place"],
    ["1200 Main St", "address"],
    ["12 oak", "address"],
  ] as const)("%j -> %s", (text, expected) => {
    expect(classifyQuery(text)).toBe(expected);
  });
});

describe("normalisePermit", () => {
  it("adds the BP suffix and keeps an existing one", () => {
    expect(normalisePermit("2026-121002")).toBe("2026-121002 BP");
    expect(normalisePermit("2026-121002 BP")).toBe("2026-121002 BP");
    expect(normalisePermit("2026-121002bp")).toBe("2026-121002 BP");
  });
});

describe("suggestFromGazetteer", () => {
  it("suggests Pflugerville city for 'pflu' with coordinates", () => {
    const out = suggestFromGazetteer("pflu");
    expect(out[0]?.label).toBe("Pflugerville city");
    expect(out[0]?.kind).toBe("place");
    expect(out[0]?.point?.lat).toBeGreaterThan(30);
    expect(out[0]?.point?.lng).toBeLessThan(-97);
  });
  it("suggests ZIPs by prefix, all starting with it and with coordinates", () => {
    const out = suggestFromGazetteer("787");
    expect(out.length).toBeGreaterThan(1);
    for (const o of out) {
      expect(o.kind).toBe("zip");
      expect(o.label.startsWith("787")).toBe(true);
      expect(o.point).toBeDefined();
    }
  });
  it("finds the exact ZIP 78660, also typed as 'zip 78660'", () => {
    expect(suggestFromGazetteer("78660").map((o) => o.label)).toEqual(["78660"]);
    expect(suggestFromGazetteer("zip 78660").map((o) => o.label)).toEqual(["78660"]);
  });
  it("suggests nothing for an unknown place, a non-Travis ZIP, or non place/zip text", () => {
    expect(suggestFromGazetteer("zzzzqq")).toEqual([]);
    expect(suggestFromGazetteer("10001")).toEqual([]);
    expect(suggestFromGazetteer("2026-121002 BP")).toEqual([]);
    expect(suggestFromGazetteer("")).toEqual([]);
  });
  it("caps the list", () => {
    expect(suggestFromGazetteer("78").length).toBeLessThanOrEqual(6);
    expect(suggestFromGazetteer("a").length).toBeLessThanOrEqual(6);
  });
});

describe("optionsFor", () => {
  it("is empty for empty text", () => {
    expect(optionsFor("  ")).toEqual([]);
  });
  it("gives one permit option with the normalised number", () => {
    const [o, ...rest] = optionsFor("2026-121002");
    expect(rest).toEqual([]);
    expect(o).toMatchObject({ kind: "permit", lookup: "2026-121002 BP" });
  });
  it("gives one TCAD option for 6-8 digits", () => {
    expect(optionsFor("138273")).toMatchObject([{ kind: "tcad", lookup: "138273" }]);
  });
  it("offers a 5-digit non-Travis number as a TCAD account, but not 'zip 10001'", () => {
    expect(optionsFor("10001")).toMatchObject([{ kind: "tcad", lookup: "10001" }]);
    expect(optionsFor("zip 10001")).toEqual([]);
  });
  it("offers a single disabled address option with the reason", () => {
    expect(addressSource("1200 Main St")).toEqual([]);
    const out = optionsFor("1200 Main St");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "address",
      disabled: true,
      detail: ADDRESS_UNAVAILABLE_REASON,
    });
    expect(ADDRESS_UNAVAILABLE_REASON).toBe("Street addresses are not published yet");
    expect(ADDRESS_UNAVAILABLE_REASON).not.toMatch(/\bRun\b/i);
  });
});

describe("samples and provenance", () => {
  it("names the gazetteer version", () => {
    expect(GAZETTEER_PROVENANCE).toBe("Census 2024 Gazetteer · travis-places@1.0.0");
  });
  it("has 5 samples, each classified and (for place/zip) found in the gazetteer", () => {
    expect(SEARCH_SAMPLES).toHaveLength(5);
    const kinds = SEARCH_SAMPLES.map((s) => classifyQuery(s.query));
    expect(kinds).toEqual(["place", "zip", "place", "permit", "tcad"]);
    for (const s of SEARCH_SAMPLES) {
      const kind = classifyQuery(s.query);
      if (kind === "place" || kind === "zip") {
        expect(optionsFor(s.query).length).toBeGreaterThan(0);
      }
    }
  });
});
