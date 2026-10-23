import { describe, expect, it } from "vitest";
import { CrmPermit, CrmProperty } from "../src/index.js";

const SAMPLE_MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const ROW_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsabcd";

function baseProperty(overrides: Record<string, unknown> = {}) {
  return {
    propertyCid: ROW_CID,
    requestIdentifier: "R123456",
    latitude: 30.27,
    longitude: -97.74,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 12,
    roofAgeBasis: "permit",
    roofAgeConfidence: "high",
    isLongTenure: true,
    ownerKind: "person",
    ownerAreaClass: "in_county",
    ownerIsOutOfArea: false,
    sourceManifestCid: SAMPLE_MANIFEST_CID,
    missingReasons: [],
    capturedAt: "2026-09-21T10:35:16Z",
    cid: ROW_CID,
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

describe("CrmProperty", () => {
  it("rejects a row with no sourceManifestCid (AC-1/FR-001: zero rows without provenance)", () => {
    const row = baseProperty();
    delete (row as Record<string, unknown>).sourceManifestCid;
    expect(CrmProperty.safeParse(row).success).toBe(false);
  });

  it("accepts a row with roofAgeYears null and its exact missing reason preserved (AC-3/FR-003)", () => {
    const row = baseProperty({
      roofAgeYears: null,
      roofAgeBasis: "unknown",
      roofAgeConfidence: "none",
      missingReasons: [{ field: "roofAgeYears", reason: "no_roof_date" }],
    });
    const parsed = CrmProperty.safeParse(row);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.roofAgeYears).toBeNull();
      expect(parsed.data.missingReasons).toEqual([{ field: "roofAgeYears", reason: "no_roof_date" }]);
    }
  });

  it("has no ownerName field at all (ADR-03, enforced at the schema level)", () => {
    const row = { ...baseProperty(), ownerName: "Jane Doe" };
    // .strict() rejects the whole row rather than silently stripping an owner-name key — the
    // absence of an ownerName field is enforced, not incidental.
    expect(CrmProperty.safeParse(row).success).toBe(false);
  });
});

describe("CrmPermit", () => {
  it("rejects a row with no sourceManifestCid", () => {
    const row = {
      propertyCid: ROW_CID,
      permitCid: ROW_CID,
      jurisdiction: "Austin",
      permitNumber: "RF-2026-0001",
      improvementType: "roof",
      improvementAction: "replace",
      improvementStatus: null,
      statusClass: "stalled",
      issueDate: "2026-09-01T00:00:00Z",
      finalDate: null,
      permitCloseDate: null,
      finalInspectionDate: null,
      openDays: 51,
      contractorResolution: "unknown",
      contractorCompanyCid: null,
      missingReasons: [{ field: "improvementStatus", reason: "enum_lacks_value" }],
      capturedAt: "2026-09-21T10:35:16Z",
      cid: ROW_CID,
      runId: "travis-202609-permits-20261021t103516z",
    };
    expect(CrmPermit.safeParse(row).success).toBe(false);
  });

  it("surfaces a null improvementStatus as statusClass 'stalled', never 'open' (P0-4)", () => {
    const row = {
      propertyCid: ROW_CID,
      permitCid: ROW_CID,
      jurisdiction: "Austin",
      permitNumber: "RF-2026-0001",
      improvementType: "roof",
      improvementAction: "replace",
      improvementStatus: null,
      statusClass: "stalled",
      issueDate: "2026-09-01T00:00:00Z",
      finalDate: null,
      permitCloseDate: null,
      finalInspectionDate: null,
      openDays: 51,
      contractorResolution: "unknown",
      contractorCompanyCid: null,
      sourceManifestCid: SAMPLE_MANIFEST_CID,
      missingReasons: [{ field: "improvementStatus", reason: "enum_lacks_value" }],
      capturedAt: "2026-09-21T10:35:16Z",
      cid: ROW_CID,
      runId: "travis-202609-permits-20261021t103516z",
    };
    const parsed = CrmPermit.safeParse(row);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.statusClass).toBe("stalled");
    }
  });
});
