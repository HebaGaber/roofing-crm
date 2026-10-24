// B-09 T039/T040: the Ask screen. `askApi`'s hooks are mocked (same pattern as
// test/leads/LeadDetail.test.tsx mocking leadsApi) so these tests exercise only this screen's own
// rendering and the confirm-lead click guard (never an automatic write), not the tRPC wiring
// itself (that's askApi.test.tsx, mirroring test/leads/leadsApi.test.tsx).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AgentAnswer } from "@crm/shared";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const askMutate = vi.fn();
let askState: { isPending: boolean; isError: boolean; data: AgentAnswer | undefined } = {
  isPending: false,
  isError: false,
  data: undefined,
};

const confirmMutate = vi.fn();
let confirmState: { isPending: boolean; isSuccess: boolean; isError: boolean } = {
  isPending: false,
  isSuccess: false,
  isError: false,
};

vi.mock("../../src/routes/Ask/askApi", () => ({
  useAskAgent: () => ({ mutate: askMutate, ...askState }),
  useConfirmLead: () => ({ mutate: confirmMutate, ...confirmState }),
}));

import { Component as Ask } from "../../src/routes/Ask/Ask";

const MANIFEST_CID = "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu";

const PLAN: AgentAnswer["plan"] = {
  intent: "find_properties",
  area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
  filters: {},
  slotSources: {},
  unsupported: [],
};

function answeredFixture(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    outcome: "answered",
    claims: [{ text: "3 properties near Pflugerville have roofs over 20 years old.", citationIds: [1] }],
    citations: [
      {
        id: 1,
        kind: "property",
        propertyCid: "bafyproperty0000000000000000000000000000000000000000000001",
        sourceUrl: null,
        capturedAt: "2026-10-20T00:00:00Z",
        tableCid: "bafytable00000000000000000000000000000000000000000000001",
        manifestCid: MANIFEST_CID,
        asOf: "2026-10-20",
      },
    ],
    plan: PLAN,
    resultSetId: "resultset-1",
    counts: { matched: 3, shown: 1, excludedNoCoordinates: 0, excludedNoRoofDate: 0, truncated: false },
    missing: [],
    proposals: [{ tcadId: "0201885122", alreadyLead: false }],
    trace: {
      traceId: "trace-1",
      modelId: "test-model",
      promptVersion: "2026-10-23",
      rankVersion: "2026-10-23",
      toolSteps: 1,
      modelCalls: 2,
    },
    ...overrides,
  };
}

function renderAsk(): void {
  render(
    <MemoryRouter>
      <Ask />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  askMutate.mockReset();
  confirmMutate.mockReset();
  askState = { isPending: false, isError: false, data: undefined };
  confirmState = { isPending: false, isSuccess: false, isError: false };
});

describe("Ask screen", () => {
  it("renders the question input and submits a trimmed question", () => {
    renderAsk();
    const input = screen.getByLabelText("Question");
    fireEvent.change(input, { target: { value: "  roofs near Pflugerville  " } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(askMutate).toHaveBeenCalledTimes(1);
    const [callArg] = askMutate.mock.calls[0] as [{ question: string; threadId: string }];
    expect(callArg.question).toBe("roofs near Pflugerville");
    expect(typeof callArg.threadId).toBe("string");
    expect(callArg.threadId.length).toBeGreaterThan(0);
  });

  it("does not submit a blank question", () => {
    renderAsk();
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(askMutate).not.toHaveBeenCalled();
  });

  it('shows the "Working…" state while the mutation is pending, data-state="working"', () => {
    askState = { ...askState, isPending: true };
    renderAsk();
    expect(screen.getByText("Working…")).toBeTruthy();
    expect(screen.getByLabelText("Ask").getAttribute("data-state")).toBe("working");
  });

  it("starts idle before anything is asked", () => {
    renderAsk();
    expect(screen.getByLabelText("Ask").getAttribute("data-state")).toBe("idle");
  });

  it("renders an answered response's claims and citations, data-state=\"answer\"", () => {
    askState = { ...askState, data: answeredFixture() };
    renderAsk();
    expect(screen.getByLabelText("Ask").getAttribute("data-state")).toBe("answer");
    expect(
      screen.getByText("3 properties near Pflugerville have roofs over 20 years old."),
    ).toBeTruthy();
    // the citation shows the property's CID (truncated text, full value in data-cid)
    expect(
      screen.getByText((_, el) => el?.getAttribute("data-cid") === answeredFixture().citations[0]?.propertyCid),
    ).toBeTruthy();
    // "open on map" links to the map route selecting that property
    const link = screen.getByRole("link", { name: "Open on map" });
    expect(link.getAttribute("href")).toContain(encodeURIComponent(answeredFixture().citations[0]?.propertyCid ?? ""));
  });

  it("shows the confirm-lead card and calls confirmLead only on an explicit click", () => {
    askState = { ...askState, data: answeredFixture() };
    renderAsk();
    expect(screen.getByText("TCAD 0201885122")).toBeTruthy();
    // never called automatically just by rendering the proposal
    expect(confirmMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(confirmMutate).toHaveBeenCalledTimes(1);
    const [callArg] = confirmMutate.mock.calls[0] as [{ threadId: string; tcadId: string }];
    expect(callArg.tcadId).toBe("0201885122");
    expect(typeof callArg.threadId).toBe("string");
  });

  it("shows an already-a-lead pill instead of a Create button when alreadyLead is true", () => {
    askState = {
      ...askState,
      data: answeredFixture({ proposals: [{ tcadId: "9999999999", alreadyLead: true }] }),
    };
    renderAsk();
    expect(screen.getByText(/already a lead/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create lead" })).toBeNull();
  });

  it('maps empty_in_scope to data-state="no_results" with an honest empty message', () => {
    askState = {
      ...askState,
      data: answeredFixture({ outcome: "empty_in_scope", claims: [], proposals: undefined }),
    };
    renderAsk();
    expect(screen.getByLabelText("Ask").getAttribute("data-state")).toBe("no_results");
    expect(screen.getByText(/no matching properties or permits/i)).toBeTruthy();
  });

  it('maps needs_clarification to data-state="low_confidence" without inventing candidate buttons', () => {
    askState = {
      ...askState,
      data: answeredFixture({ outcome: "needs_clarification", claims: [], proposals: undefined }),
    };
    renderAsk();
    expect(screen.getByLabelText("Ask").getAttribute("data-state")).toBe("low_confidence");
    expect(screen.getByText(/not sure which place you meant/i)).toBeTruthy();
    expect(screen.queryAllByRole("button").filter((b) => b.textContent !== "Ask")).toHaveLength(0);
  });

  it('maps rate_limited to data-state="throttled" rendered as an alert', () => {
    askState = {
      ...askState,
      data: answeredFixture({ outcome: "rate_limited", claims: [], proposals: undefined }),
    };
    renderAsk();
    expect(screen.getByLabelText("Ask").getAttribute("data-state")).toBe("throttled");
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
