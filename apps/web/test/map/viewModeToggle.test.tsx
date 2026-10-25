// The ONE segmented control above the map at three-pane widths: Map + cards | List | Ask AI.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapViewToggle } from "../../src/routes/Map/MapViewToggle.js";

afterEach(cleanup);

describe("MapViewToggle", () => {
  it("is one group of three aria-pressed buttons, exactly one pressed", () => {
    render(<MapViewToggle selected="cards" onSelect={vi.fn()} />);
    const group = screen.getByRole("group", { name: "View" });
    const buttons = group.querySelectorAll("button");
    expect([...buttons].map((b) => b.textContent)).toEqual(["Map + cards", "List", "Ask AI"]);
    expect([...buttons].filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Map + cards" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it.each([
    ["list", "List"],
    ["ai", "Ask AI"],
  ] as const)("shows %s as the pressed one", (selected, name) => {
    render(<MapViewToggle selected={selected} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("true");
  });

  it("reports the choice", () => {
    const onSelect = vi.fn();
    render(<MapViewToggle selected="cards" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    fireEvent.click(screen.getByRole("button", { name: "Map + cards" }));
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual(["list", "ai", "cards"]);
  });
});
