// B-03 structural rebuild: the roof-age chip row (CRM-HANDOFF §4.2, chips 10/13/15/20/25) and the
// permit-status/permit-open-years controls. Updated for the duplicate-controls fix (B-03,
// 2026-10-24): permit status/open-years are no longer optional additions kept beside a legacy
// "Show open permits" checkbox — they are the sheet's only permit controls, so their props are
// required and always rendered (filter-sheet-controlled.test.tsx covers the roof-age "Other"
// field and the sheet's open/close behaviour).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterSheet, ROOF_AGE_CHIPS } from "../src/routes/Map/FilterSheet";

afterEach(cleanup);

function renderSheet(
  overrides: Partial<Parameters<typeof FilterSheet>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <FilterSheet
      roofAgeMinYears={15}
      onRoofAgeMinYearsChange={vi.fn()}
      permitStatus="any"
      onPermitStatusChange={vi.fn()}
      permitOpenYrs={undefined}
      onPermitOpenYrsChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("FilterSheet roof-age chips", () => {
  it("offers the five named thresholds and highlights the active one", () => {
    renderSheet({ roofAgeMinYears: 15 });
    // Below 840px (this test's jsdom width) the controls sit behind the "Filters" button.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    for (const years of ROOF_AGE_CHIPS) {
      expect(screen.getByRole("button", { name: String(years) })).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: "15" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a chip commits that threshold", () => {
    const onChange = vi.fn();
    renderSheet({ roofAgeMinYears: 15, onRoofAgeMinYearsChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "25" }));
    expect(onChange).toHaveBeenCalledWith(25);
  });
});

describe("FilterSheet permit status and open-years (the sheet's only permit controls)", () => {
  it("shows Open/Stalled/Any and reports the click", () => {
    const onChange = vi.fn();
    renderSheet({ permitStatus: "any", onPermitStatusChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onChange).toHaveBeenCalledWith("open");
  });

  it("the permit-open-years select reports Any as undefined", () => {
    const onChange = vi.fn();
    renderSheet({ permitOpenYrs: 5, onPermitOpenYrsChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Permit open ≥"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
