// B-03 FilterSheet tests (tasks.md T025a; AC-3, AC-5, FR-003, FR-005). Replaces the A-13/
// ORACLE-u version this file was copied from (C1 copy, 2026-10-23), which exercised that story's
// place/tenure/ooa/sort controls — none of which exist on this story's own `FilterSheet.tsx`
// (rewritten for B-03's two controls: the roof-age threshold and the permit-view toggle).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOF_AGE_YEARS } from "@crm/domain";
import { committedRoofAge, FilterSheet } from "../src/routes/Map/FilterSheet";

afterEach(cleanup);

describe("FilterSheet", () => {
  it("B-03-TC-011: shows the roof-age threshold and the default placeholder", () => {
    render(
      <FilterSheet
        roofAgeMinYears={DEFAULT_ROOF_AGE_YEARS}
        permitView={false}
        onRoofAgeMinYearsChange={vi.fn()}
        onPermitViewChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Roof age") as HTMLInputElement;
    expect(input.value).toBe("15");
  });

  it("commits an integer roof-age threshold on change", () => {
    const onChange = vi.fn();
    render(
      <FilterSheet
        roofAgeMinYears={15}
        permitView={false}
        onRoofAgeMinYearsChange={onChange}
        onPermitViewChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Roof age");
    fireEvent.change(input, { target: { value: "25" } });
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it("an emptied roof-age box clears the filter (undefined, never 0) — FR-003's 'no filter' state", () => {
    const onChange = vi.fn();
    render(
      <FilterSheet
        roofAgeMinYears={15}
        permitView={false}
        onRoofAgeMinYearsChange={onChange}
        onPermitViewChange={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Roof age");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("B-03-TC-016: toggles the permit view", () => {
    const onChange = vi.fn();
    render(
      <FilterSheet
        roofAgeMinYears={15}
        permitView={false}
        onRoofAgeMinYearsChange={vi.fn()}
        onPermitViewChange={onChange}
      />,
    );
    // The panel is collapsed below 840px until "Filters" is opened (same pattern as the file
    // this replaces).
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const box = screen.getByRole("checkbox", { name: "Show open permits" }) as HTMLInputElement;
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("committedRoofAge", () => {
  it("rounds a decimal to the nearest integer", () => {
    expect(committedRoofAge("15.6")).toBe(16);
  });

  it("clamps a negative value to 0, never a negative age", () => {
    expect(committedRoofAge("-5")).toBe(0);
  });

  it("an empty string is 'no filter' (undefined), not 0", () => {
    expect(committedRoofAge("")).toBeUndefined();
  });

  it("non-numeric text is 'no filter' (undefined), never NaN", () => {
    expect(committedRoofAge("abc")).toBeUndefined();
  });
});
