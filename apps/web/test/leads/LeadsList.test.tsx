// B-07 T020: LeadsList states (AC-4 + edge cases). The leads API hooks are mocked; the component
// must show an explicit empty state, never an error or an endless spinner, and flag leads that are
// not in the current run instead of showing them as current.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useLeadsList = vi.fn();
vi.mock("../../src/routes/Leads/leadsApi", () => ({
  useLeadsList: (...args: unknown[]) => useLeadsList(...args),
}));

import { Component as LeadsList } from "../../src/routes/Leads/LeadsList";

afterEach(() => {
  cleanup();
  useLeadsList.mockReset();
});

function renderAt(url: string): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <LeadsList />
    </MemoryRouter>,
  );
}

const lead = {
  leadId: "01J0LEAD",
  leadKey: "48453:tcad:0201885122",
  address: "TCAD 0201885122",
  lat: 30.27,
  lon: -97.74,
  status: "new" as const,
  assignee: "rep@example.com",
  createdFrom: "map" as const,
  sourceManifestCid: "bafkreimanifest",
  createdAt: "2026-10-20T09:14:00Z",
  eventSequence: 0,
  notInCurrentRun: false,
};

describe("LeadsList", () => {
  it("shows an explicit empty state when there are no leads at all", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    expect(screen.getByRole("heading", { name: /no leads yet/i })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  it("shows a distinct no-match state when filters match zero leads", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    renderAt("/leads?roof=25&permit=stalled");
    expect(screen.getByRole("heading", { name: /no leads match these filters/i })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error banner with Retry on failure", () => {
    useLeadsList.mockReturnValue({ status: "error", error: new Error("x"), refetch: vi.fn() });
    renderAt("/leads");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("lists leads with the total, link to detail, and flags a lead not in the current run", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: {
        leads: [
          lead,
          { ...lead, leadId: "01J0GONE", leadKey: "48453:tcad:0000000000", notInCurrentRun: true },
        ],
        totalCount: 2,
      },
      refetch: vi.fn(),
    });
    renderAt("/leads");
    expect(screen.getByText("2 leads")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /TCAD 0201885122/ })).toHaveLength(2);
    // the row pill and the banner above the list
    expect(screen.getAllByText(/not in the current run/i)).toHaveLength(2);
    expect(screen.getByText(/1 lead keeps its snapshot/i)).toBeTruthy();
  });

  it("passes URL filters to leads.list", () => {
    useLeadsList.mockReturnValue({
      status: "success",
      data: { leads: [], totalCount: 0 },
      refetch: vi.fn(),
    });
    renderAt("/leads?roof=20&permit=open");
    expect(useLeadsList).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ roofAgeMinYears: 20, permitStatus: "open" }),
      }),
    );
  });
});
