// B-07: LeadsList filter and pager interactions. Each control must write the URL (so a filter
// combination is shareable, AC-4) and the list query must be re-issued from the new URL.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
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

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>;
}

function renderAt(url: string): void {
  render(
    <MemoryRouter initialEntries={[url]}>
      <LeadsList />
      <Where />
    </MemoryRouter>,
  );
}

const url = (): string => screen.getByTestId("where").textContent ?? "";
const params = (): URLSearchParams => new URLSearchParams(url().split("?")[1] ?? "");

const lead = {
  leadId: "01J0LEAD",
  leadKey: "48453:tcad:0201885122",
  address: "TCAD 0201885122",
  lat: 30.27,
  lon: -97.74,
  status: "contacted" as const,
  assignee: "rep@example.com",
  createdFrom: "map" as const,
  sourceManifestCid: "bafkreimanifest",
  createdAt: "2026-10-20T09:14:00Z",
  eventSequence: 0,
  notInCurrentRun: false,
};

function withLeads(extra: Record<string, unknown> = {}, totalCount = 1): void {
  useLeadsList.mockReturnValue({
    status: "success",
    data: { leads: [lead], totalCount, ...extra },
    refetch: vi.fn(),
  });
}

describe("LeadsList loading and retry", () => {
  it("shows a skeleton, not an error or empty state, while loading", () => {
    useLeadsList.mockReturnValue({ status: "pending" });
    renderAt("/leads");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/no leads/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Leads" })).toBeTruthy();
  });

  it("Retry refetches the list", () => {
    const refetch = vi.fn();
    useLeadsList.mockReturnValue({ status: "error", error: new Error("x"), refetch });
    renderAt("/leads");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("LeadsList rows", () => {
  it("renders status, assignee and created time, and a singular count", () => {
    withLeads();
    renderAt("/leads");
    expect(screen.getByText("1 lead")).toBeTruthy();
    expect(within(screen.getByRole("listitem")).getByText("Contacted")).toBeTruthy();
    expect(screen.getByText("Assignee rep@example.com")).toBeTruthy();
    expect(screen.getByText("Created 2026-10-20 09:14 UTC")).toBeTruthy();
    expect(screen.getByRole("link", { name: "TCAD 0201885122" }).getAttribute("href")).toBe(
      `/leads/${encodeURIComponent(lead.leadKey)}`,
    );
  });
});

describe("LeadsList filters write the URL", () => {
  it("selecting a roof-age chip sets roof, and pressing it again clears it", () => {
    withLeads();
    renderAt("/leads");
    const chip = screen.getByRole("button", { name: "20", pressed: false });
    fireEvent.click(chip);
    expect(params().get("roof")).toBe("20");
    expect(screen.getByRole("button", { name: "20" }).getAttribute("aria-pressed")).toBe("true");
    expect(useLeadsList).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ roofAgeMinYears: 20 }) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "20" }));
    expect(params().has("roof")).toBe(false);
  });

  it("selecting a permit status chip sets permit, and pressing it again clears it", () => {
    withLeads();
    renderAt("/leads");
    fireEvent.click(screen.getByRole("button", { name: "Stalled" }));
    expect(params().get("permit")).toBe("stalled");
    fireEvent.click(screen.getByRole("button", { name: "Stalled" }));
    expect(params().has("permit")).toBe(false);
  });

  it("the status select filters by status and 'Any' removes it", () => {
    withLeads();
    renderAt("/leads");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "won" } });
    expect(params().get("status")).toBe("won");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "" } });
    expect(params().has("status")).toBe(false);
  });

  it("latitude, longitude and radius write the URL and an emptied field removes its key", () => {
    withLeads();
    renderAt("/leads");
    fireEvent.change(screen.getByLabelText("Center latitude"), { target: { value: "30.27" } });
    fireEvent.change(screen.getByLabelText("Center longitude"), { target: { value: "-97.74" } });
    fireEvent.change(screen.getByLabelText("Radius, mi"), { target: { value: "10" } });
    expect(params().get("lat")).toBe("30.27");
    expect(params().get("lng")).toBe("-97.74");
    expect(params().get("r")).toBe("10");
    expect(useLeadsList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ centerLat: 30.27, centerLon: -97.74, radiusMi: 10 }),
      }),
    );
    fireEvent.change(screen.getByLabelText("Center latitude"), { target: { value: "" } });
    expect(params().has("lat")).toBe(false);
    expect(params().get("lng")).toBe("-97.74");
  });

  it("Clear filters removes every filter and is hidden when none is active", () => {
    withLeads();
    renderAt("/leads?roof=20&permit=open&status=new&lat=30&lng=-97&r=8&assignee=a%40b.c");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(url()).toBe("/leads");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("a filter change drops a stale page cursor", () => {
    withLeads();
    renderAt("/leads?cursor=abc");
    fireEvent.click(screen.getByRole("button", { name: "25" }));
    expect(params().get("roof")).toBe("25");
    expect(params().has("cursor")).toBe(false);
  });
});

describe("LeadsList pagination", () => {
  it("offers Next page only when the server returned a cursor, and writes it to the URL", () => {
    withLeads({ nextCursor: "CUR2" }, 40);
    renderAt("/leads");
    expect(screen.queryByRole("button", { name: "First page" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(params().get("cursor")).toBe("CUR2");
    expect(useLeadsList).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "CUR2" }));
  });

  it("First page clears the cursor; no Next page on the last page", () => {
    withLeads();
    renderAt("/leads?cursor=CUR2");
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    expect(params().has("cursor")).toBe(false);
    expect(screen.queryByRole("button", { name: "First page" })).toBeNull();
  });
});
