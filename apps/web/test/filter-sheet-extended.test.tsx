// B-03 structural rebuild: the roof-age chip row (CRM-HANDOFF §4.2, chips 10/13/15/20/25) and the
// new permit-status/permit-open-years controls, both optional additions kept backward-compatible
// with filter-sheet-controlled.test.tsx's existing coverage of the roof-age field and the
// permit-view checkbox.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterSheet, ROOF_AGE_CHIPS } from "../src/routes/Map/FilterSheet";

afterEach(cleanup);

describe("FilterSheet roof-age chips", () => {
  it("offers the five named thresholds and highlights the active one", () => {
    render(
      <FilterSheet
        roofAgeMinYears={15}
        permitView={false}
        onRoofAgeMinYearsChange={vi.fn()}
        onPermitViewChange={vi.fn()}
      />,
    );
    // Below 840px (this test's jsdom width) the controls sit behind the "Filters" button.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    for (const years of ROOF_AGE_CHIPS) {
      expect(screen.getByRole("button", { name: String(years) })).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: "15" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a chip commits that threshold", () => {
    const onChange = vi.fn();
    render(
      <FilterSheet
        roofAgeMinYears={15}
        permitView={false}
        onRoofAgeMinYearsChange={onChange}
        onPermitViewChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "25" }));
    expect(onChange).toHaveBeenCalledWith(25);
  });
});

describe("FilterSheet permit status and open-years (optional, hidden unless wired)", () => {
  it("renders nothing extra when the caller doesn't pass the new handlers", () => {
    render(
      <FilterSheet
        roofAgeMinYears={15}
        permitView={false}
        onRoofAgeMinYearsChange={vi.fn()}
        onPermitViewChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByRole("group", { name: "Permit status" })).toBeNull();
  });

  it("shows Open/Stalled/Any and reports the click", () => {
    const onChange = vi.fn();
    render(
      <FilterSheet
        roofAgeMinYears={15}
        permitView
        onRoofAgeMinYearsChange={vi.fn()}
        onPermitViewChange={vi.fn()}
        permitStatus="any"
        onPermitStatusChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onChange).toHaveBeenCalledWith("open");
  });

  it("the permit-open-years select reports Any as undefined", () => {
    const onChange = vi.fn();
    render(
      <FilterSheet
        roofAgeMinYears={15}
        permitView
        onRoofAgeMinYearsChange={vi.fn()}
        onPermitViewChange={vi.fn()}
        permitOpenYrs={5}
        onPermitOpenYrsChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Permit open ≥"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
