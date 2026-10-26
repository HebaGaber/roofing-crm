// Map search box: combobox semantics, keyboard, selection, samples, exact lookups and the
// disabled address path.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBox, type ExactLookupResult } from "../../src/routes/Map/SearchBox";

afterEach(cleanup);

function setup(result: ExactLookupResult = { found: false, runId: "run-3" }) {
  const onCentre = vi.fn();
  const onOpenProperty = vi.fn();
  const lookup = vi.fn(async () => result);
  render(<SearchBox onCentre={onCentre} onOpenProperty={onOpenProperty} lookup={lookup} />);
  const input = screen.getByRole("combobox");
  return { input, onCentre, onOpenProperty, lookup };
}

describe("SearchBox", () => {
  it("is a combobox with the placeholder and a collapsed listbox", () => {
    const { input } = setup();
    expect(input.getAttribute("placeholder")).toBe("Search an address, place, ZIP or permit");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox", { hidden: true }).id,
    );
  });

  it("shows five working samples and the provenance when focused and empty", () => {
    const { input } = setup();
    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Try")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByText(/travis-places@1\.0\.0/)).toBeTruthy();
  });

  it("clicking a place sample centres the map there", () => {
    const { input, onCentre } = setup();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /^Pflugerville/ }));
    expect(onCentre).toHaveBeenCalledTimes(1);
    expect(onCentre.mock.calls[0]?.[0].lat).toBeGreaterThan(30);
    expect((input as HTMLInputElement).value).toBe("Pflugerville");
  });

  it("suggests Pflugerville city for 'pflu' with the gazetteer source", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "pflu" } });
    expect(screen.getByRole("option", { name: /Pflugerville city/ })).toBeTruthy();
    expect(screen.getByText("Census 2024 Gazetteer · travis-places@1.0.0")).toBeTruthy();
  });

  it("walks options with Up/Down, sets aria-activedescendant, Enter chooses, Escape closes", () => {
    const { input, onCentre } = setup();
    fireEvent.change(input, { target: { value: "787" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = screen.getAllByRole("option")[0] as HTMLElement;
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
    expect(first.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBe(first.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCentre).toHaveBeenCalledTimes(1);
  });

  it("Enter without an active option picks the first enabled one", () => {
    const { input, onCentre } = setup();
    fireEvent.change(input, { target: { value: "78660" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCentre).toHaveBeenCalledTimes(1);
  });

  it("Escape on a closed box clears it; the clear button clears and refocuses", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "pflu" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
    fireEvent.change(input, { target: { value: "round" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("says plainly when no place or ZIP matches", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "zzzzqq" } });
    expect(screen.getByText(/No place or ZIP in Travis County matches/)).toBeTruthy();
  });

  it("looks a permit up only when chosen, then opens its property", async () => {
    const found: ExactLookupResult = { found: true, propertyCid: "cid-1", lat: 30.3, lng: -97.7 };
    const { input, lookup, onOpenProperty } = setup(found);
    fireEvent.change(input, { target: { value: "2026-121002" } });
    expect(lookup).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(onOpenProperty).toHaveBeenCalledWith("cid-1", { lat: 30.3, lng: -97.7 }),
    );
    expect(lookup).toHaveBeenCalledWith("permit", "2026-121002 BP");
  });

  it("resolves a TCAD account", async () => {
    const { input, lookup, onOpenProperty } = setup({
      found: true,
      propertyCid: "cid-2",
      lat: 30.1,
      lng: -97.5,
    });
    fireEvent.change(input, { target: { value: "138273" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onOpenProperty).toHaveBeenCalled());
    expect(lookup).toHaveBeenCalledWith("tcad", "138273");
  });

  it("reports a missing permit with the run searched", async () => {
    const { input, onOpenProperty } = setup({ found: false, runId: "travis-full-run3-20261025" });
    fireEvent.change(input, { target: { value: "2026-999999 BP" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("No permit 2026-999999 BP in travis-full-run3-20261025");
    expect(onOpenProperty).not.toHaveBeenCalled();
  });

  it("reports a failed lookup instead of hanging", async () => {
    const onCentre = vi.fn();
    const lookup = vi.fn(async () => {
      throw new Error("down");
    });
    render(<SearchBox onCentre={onCentre} onOpenProperty={vi.fn()} lookup={lookup} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "138273" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText(/The lookup failed/);
  });

  it("shows a disabled address option with the reason and never chooses it", () => {
    const { input, lookup, onCentre } = setup();
    fireEvent.change(input, { target: { value: "1200 Main St" } });
    const option = screen.getByRole("option", { name: /1200 Main St/ });
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.textContent).toMatch(/Run 3\.1/);
    fireEvent.click(option);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(lookup).not.toHaveBeenCalled();
    expect(onCentre).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });
});
