// apps/web/src/format/display.ts and the per-field wording in fields.ts (review findings D1, D2,
// D4, D7, D12, D13, D14): one place words each fact, and every gap names its own reason.
import { describe, expect, it } from "vitest";
import {
  ADDRESS_NOT_PUBLISHED,
  LONG_TENURE_OVER_YEARS,
  SOURCE_PERMITS_LABEL,
  addressLine,
  bbbGapText,
  contractorReasonText,
  groupMissing,
  missingReasonText,
  openDurationText,
  permitsSourceLabel,
  tenureBandLabel,
} from "../../src/format/index.js";

describe("tenure wording", () => {
  it("reads over 10 years, so exactly 10 is not long tenure", () => {
    expect(LONG_TENURE_OVER_YEARS).toBe(10);
    expect(tenureBandLabel(true)).toBe("Over 10 years");
    expect(tenureBandLabel(false)).toBe("10 years or fewer");
  });
});

describe("missingReasonText per field", () => {
  it("words no_owner_record for the owner columns, whatever order they arrive in", () => {
    for (const field of ["owner_name", "owner_kind", "owner_area_class"]) {
      expect(missingReasonText(field, "no_owner_record")).toBe(
        "Owner not published (confidential or name not parsed)",
      );
    }
  });

  it("says no contractor was printed rather than not matched", () => {
    expect(missingReasonText("contractor_name_as_printed", "contractor_unresolved")).toBe(
      "No contractor printed on the permit",
    );
  });

  it("says a permit with no open duration is not open (finaled)", () => {
    expect(missingReasonText("open_days", "not_open")).toBe("Not open (finaled)");
    expect(missingReasonText("open_days", "needs_review")).toBe(
      "Needs review: could not be derived",
    );
  });

  it("decides the label per field when real rows list owner_is_out_of_area first", () => {
    const groups = groupMissing([
      { field: "owner_is_out_of_area", reason: "no_owner_record" },
      { field: "owner_name", reason: "no_owner_record" },
      { field: "owner_kind", reason: "no_owner_record" },
    ]);
    const owner = groups.find((g) => g.fields.includes("owner_name"));
    expect(owner?.reasonLabel).toBe("Owner not published (confidential or name not parsed)");
    expect(owner?.fields).toEqual(["owner_name", "owner_kind"]);
    expect(groups.find((g) => g.fields.includes("owner_is_out_of_area"))?.reasonLabel).toBe(
      "No owner on the latest sale",
    );
  });
});

describe("addressLine", () => {
  it("keeps the current text when the entry says not_in_export, or there is none", () => {
    expect(
      addressLine({ missingReasons: [{ field: "unnormalized_address", reason: "not_in_export" }] }),
    ).toBe(ADDRESS_NOT_PUBLISHED);
    expect(addressLine({ missingReasons: [] })).toBe(ADDRESS_NOT_PUBLISHED);
  });

  it("names another reason from the property's own entry", () => {
    expect(
      addressLine({
        missingReasons: [{ field: "unnormalized_address", reason: "source_missing" }],
      }),
    ).toBe("Address not published · Not on the source record");
  });

  it("shows an address the row carries and never claims it is not published", () => {
    expect(
      addressLine({
        unnormalizedAddress: "1 Main St",
        missingReasons: [{ field: "unnormalized_address", reason: "not_in_export" }],
      }),
    ).toBe("1 Main St");
  });
});

describe("permit gaps read the permit's own reasons", () => {
  it("open duration: the entry's reason, never a bare 'not available'", () => {
    expect(
      openDurationText({
        openDays: null,
        missingReasons: [{ field: "open_days", reason: "not_open" }],
      }),
    ).toBe("Not open (finaled)");
    expect(openDurationText({ openDays: null, missingReasons: [] })).toMatch(/no reason recorded/);
    expect(openDurationText({ openDays: 400 })).toBe("open 1.1 years");
  });

  it("contractor and BBB use the entry on the permit, not a hard-coded code", () => {
    expect(
      contractorReasonText({
        missingReasons: [{ field: "contractor_name_as_printed", reason: "contractor_unresolved" }],
      }),
    ).toBe("No contractor printed on the permit");
    expect(
      bbbGapText({
        bbbStatusReason: null,
        missingReasons: [{ field: "bbb_rating", reason: "bbb_blocked" }],
      }),
    ).toBe("BBB rating not available · BBB blocked the lookup");
    expect(bbbGapText({ bbbStatusReason: null, missingReasons: [] })).toMatch(/no reason recorded/);
  });
});

describe("permitsSourceLabel", () => {
  it("derives the city from the permit's jurisdiction, else the named constant", () => {
    expect(permitsSourceLabel({ jurisdiction: "austin" })).toBe("Austin permits");
    expect(permitsSourceLabel({ jurisdiction: null })).toBe(SOURCE_PERMITS_LABEL);
    expect(permitsSourceLabel()).toBe(SOURCE_PERMITS_LABEL);
  });
});
