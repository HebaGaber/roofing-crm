// MapLegend (CRM-HANDOFF E-72 "Legend per layer"; prototype Explore1440 `atlas-legend`).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MapLegend } from "../../../src/components/Map/MapLegend.js";

afterEach(cleanup);

describe("MapLegend", () => {
  it("in the overview, titles the roof scale per hexagon and lists the five roof-age steps", () => {
    render(<MapLegend mode="overview" roofs permits loadedCount={42} />);
    expect(screen.getByText("Median roof age per hexagon, yrs")).not.toBeNull();
    for (const step of ["0–9", "10–14", "15–19", "20–24", "25+"]) {
      expect(screen.getByText(step)).not.toBeNull();
    }
    expect(screen.getByText("Permit open, yrs · clusters")).not.toBeNull();
  });

  it("names an Atlas token for every swatch and paints it from the CSS module, not inline", () => {
    const { container } = render(<MapLegend mode="overview" roofs permits loadedCount={1} />);
    const swatches = [...container.querySelectorAll<HTMLElement>("[data-swatch]")];
    expect(swatches.length).toBeGreaterThanOrEqual(10);
    for (const s of swatches) {
      expect(s.getAttribute("data-swatch")).toMatch(/^--(viz|md-sys)-/);
      expect(s.getAttribute("style")).toBeNull();
      expect(s.className.split(" ").length).toBe(2);
    }
  });

  it("explains that the overview covers only the loaded results (no county-wide aggregate is published)", () => {
    render(<MapLegend mode="overview" roofs permits={false} loadedCount={42} />);
    expect(screen.getByText(/42 properties loaded around your pin/)).not.toBeNull();
    expect(
      screen.getByText(/county-wide overview is not published by the search API/),
    ).not.toBeNull();
    expect(screen.queryByText(/Permit open/)).toBeNull();
  });

  it("says why the overview is empty before any search", () => {
    render(<MapLegend mode="overview" roofs permits loadedCount={0} />);
    expect(screen.getByText(/No properties loaded yet/)).not.toBeNull();
  });

  it("in the marker view, titles the roof scale per property and explains the marker shapes", () => {
    render(<MapLegend mode="detail" roofs permits loadedCount={3} />);
    expect(screen.getByText("Roof age, yrs")).not.toBeNull();
    expect(screen.getByText("Permit open, yrs")).not.toBeNull();
    expect(screen.getByText(/dark ring = open over 5 yrs/)).not.toBeNull();
  });

  it("names the no-roof-age colour so a grey hexagon or marker is never unexplained", () => {
    render(<MapLegend mode="overview" roofs permits={false} loadedCount={3} />);
    expect(screen.getByText("No roof age published")).not.toBeNull();
  });

  it("renders nothing when both layers are off", () => {
    const { container } = render(
      <MapLegend mode="overview" roofs={false} permits={false} loadedCount={3} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
