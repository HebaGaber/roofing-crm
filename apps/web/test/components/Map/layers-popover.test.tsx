// LayersPopover (CRM-HANDOFF E-72): the four designed layers; the two our data supports are
// switches, the two it cannot draw are shown disabled with the reason (missing data says why).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayersPopover, type LayersState } from "../../../src/components/Map/LayersPopover.js";

afterEach(cleanup);

const ON: LayersState = { roofs: true, permits: true, gaps: false };

function open(): void {
  fireEvent.click(screen.getByRole("button", { name: "Layers" }));
}

describe("LayersPopover", () => {
  it("lists the designed layers in order", () => {
    render(<LayersPopover value={ON} onChange={() => undefined} />);
    open();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.closest("label")?.textContent ?? "")).toEqual([
      expect.stringContaining("Aged roofs"),
      expect.stringContaining("Open and stalled permits"),
      expect.stringContaining("My leads"),
      expect.stringContaining("Permit coverage gaps"),
    ]);
  });

  it("describes the overview behaviour of the live layers", () => {
    render(<LayersPopover value={ON} onChange={() => undefined} />);
    open();
    expect(screen.getByText(/Hexagons by median roof age when zoomed out/)).not.toBeNull();
    expect(screen.getByText(/Clusters by open duration when zoomed out/)).not.toBeNull();
  });

  it("toggles a live layer", () => {
    const onChange = vi.fn();
    render(<LayersPopover value={ON} onChange={onChange} />);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: /Aged roofs/ }));
    expect(onChange).toHaveBeenCalledWith({ ...ON, roofs: false });
  });

  it("disables the layers it cannot draw and says why", () => {
    render(<LayersPopover value={ON} onChange={() => undefined} />);
    open();
    const gaps = screen.getByRole("checkbox", { name: /Permit coverage gaps/ });
    expect((gaps as HTMLInputElement).disabled).toBe(true);
    expect((gaps as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/publishes no permit-coverage areas/)).not.toBeNull();
    const leads = screen.getByRole("checkbox", { name: /My leads/ });
    expect((leads as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/not drawn on the map yet/)).not.toBeNull();
  });
});
