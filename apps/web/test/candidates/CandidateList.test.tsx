// The Candidate list over mocked data hooks: rows with the lead mark, Hide existing leads, the
// selection bar, the confirmation sheet with skipped duplicates, the bulk result snackbar, and
// the loading / empty / error / partial states of the boards.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidatesResult } from "../../src/routes/Map/Candidates/candidatesApi";
import { candidates, FILTERS, must, permit, property } from "./fixtures";

let result: CandidatesResult;
const run = vi.fn();
vi.mock("../../src/routes/Map/Candidates/candidatesApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/routes/Map/Candidates/candidatesApi")>()),
  useCandidates: () => result,
  useBulkCreateLeads: () => ({ run, state: { running: false, done: 0, total: 0 } }),
}));

import { CandidateList } from "../../src/routes/Map/Candidates/CandidateList";

const ready = (over: Partial<CandidatesResult> = {}): CandidatesResult => ({
  status: "ready",
  candidates: candidates(
    [property(1), property(2), property(3)],
    [permit(1), permit(2), permit(3, { statusClass: "open", openDays: 1400 })],
    [{ leadKey: "48453:tcad:0201885121", leadId: "L-1", status: "contacted" }],
  ),
  totalInRing: 3,
  permitsUnavailable: false,
  leadsUnavailable: false,
  refetch: vi.fn(),
  ...over,
});

const mount = (props: Partial<React.ComponentProps<typeof CandidateList>> = {}) =>
  render(
    <MemoryRouter>
      <CandidateList filters={FILTERS} {...props} />
    </MemoryRouter>,
  );

beforeEach(() => {
  result = ready();
  run.mockReset();
});
afterEach(cleanup);

describe("CandidateList", () => {
  it("shows one row per candidate with TCAD title, never an invented address", () => {
    mount();
    const rows = document.querySelectorAll("[data-candidate-row]");
    expect(rows).toHaveLength(3);
    expect(screen.getAllByText(/^TCAD 02018851/)).toHaveLength(3);
    expect(screen.getAllByText(/Address not published in this run/).length).toBeGreaterThan(0);
  });

  it("marks existing leads with Lead · {status} (E-52) and links to the lead", () => {
    mount();
    const mark = screen.getByText("Lead · Contacted");
    expect(mark.closest("a")?.getAttribute("href")).toBe("/leads/48453%3Atcad%3A0201885121");
  });

  it("Hide existing leads removes lead rows and says how many are hidden", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Hide existing leads/ }));
    expect(document.querySelectorAll("[data-candidate-row]")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Existing leads hidden \(1\)/ })).toBeTruthy();
    expect(screen.getByText("Matches").textContent).toContain("2");
  });

  it("opens the Why is this a lead? chips", () => {
    mount();
    fireEvent.click(must(screen.getAllByRole("button", { name: "Why is this a lead?" })[0]));
    expect(screen.getAllByText(/Roof \d+ yrs ≥ 15/).length).toBeGreaterThan(0);
  });

  it("selecting rows shows the bar, numbers the selection and clears", () => {
    mount();
    fireEvent.click(must(screen.getAllByRole("checkbox", { name: /Select TCAD/ })[1]));
    fireEvent.click(must(screen.getAllByRole("checkbox", { name: /Select TCAD/ })[2]));
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create 2 leads" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it("confirmation lists the main signal and skips rows that are already leads", () => {
    mount();
    for (const box of screen.getAllByRole("checkbox", { name: /Select TCAD/ }))
      fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create 3 leads" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Create 2 leads?");
    expect(within(dialog).getByText("3 selected · 1 already a lead, skipped")).toBeTruthy();
    expect(within(dialog).getByText("Already a lead · Contacted · skipped")).toBeTruthy();
    expect(within(dialog).getAllByText(/Main signal: Permit/).length).toBe(3);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends only new properties, then reports created and already-a-lead with Open Leads", async () => {
    run.mockResolvedValue({
      created: [{ id: "x", result: {} }],
      already: ["y"],
      failed: [],
    });
    mount();
    for (const box of screen.getAllByRole("checkbox", { name: /Select TCAD/ }))
      fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Create 3 leads" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Create 2 leads" }),
    );
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const sent = must(run.mock.calls[0])[0] as { input: { createdFrom: string } }[];
    expect(sent).toHaveLength(2);
    expect(sent.every((s) => s.input.createdFrom === "list")).toBe(true);
    // 1 created + (1 known lead + 1 refused by the server) already leads.
    expect(await screen.findByText("1 lead created · 2 already leads")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Leads" })).toBeTruthy();
    // No Undo: the API has no lead delete.
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("loading, error with Retry, empty with Widen / Roof chips, partial", () => {
    result = ready({ status: "loading", candidates: [] });
    const { unmount } = mount();
    expect(screen.getByText("Loading candidates from the lead index…")).toBeTruthy();
    unmount();

    const refetch = vi.fn();
    result = ready({ status: "error", candidates: [], refetch });
    const second = mount();
    expect(screen.getByText("Results unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
    second.unmount();

    result = ready({ candidates: [], totalInRing: 0 });
    const onRadiusChange = vi.fn();
    const onRoofChange = vi.fn();
    const third = mount({ onRadiusChange, onRoofChange });
    expect(screen.getByText("No roofs match within 5 mi.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Widen to 6 mi" }));
    fireEvent.click(screen.getByRole("button", { name: "Roof ≥ 13 yrs" }));
    expect(onRadiusChange).toHaveBeenCalledWith(6);
    expect(onRoofChange).toHaveBeenCalledWith(13);
    third.unmount();

    result = ready({
      permitsUnavailable: true,
      candidates: candidates([property(1), property(2), property(3)]),
    });
    mount();
    expect(screen.getByText(/Permit data couldn’t be read/)).toBeTruthy();
    expect(screen.getAllByText("Permits not loaded").length).toBe(3);
  });

  it("with no centre says why there are no candidates", () => {
    result = ready({ status: "idle", candidates: [] });
    mount();
    expect(screen.getByText(/No centre chosen yet/)).toBeTruthy();
  });

  it("Open details and Show on map report the property", () => {
    const onSelect = vi.fn();
    const onShowOnMap = vi.fn();
    mount({ onSelect, onShowOnMap });
    fireEvent.click(must(screen.getAllByRole("button", { name: /Open details for TCAD/ })[0]));
    // Show on map is a 1240 px+ column (CSS hides it below), so it is not in the a11y tree here.
    fireEvent.click(must(document.querySelector<HTMLElement>('button[aria-label$="on the map"]')));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onShowOnMap).toHaveBeenCalledOnce();
  });
});
