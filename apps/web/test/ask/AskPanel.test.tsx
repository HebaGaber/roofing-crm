// B-09 T039/T040 + review fixes (CR-B-09 finding 16/finding 20): the Ask screen. `askApi`'s hooks are mocked
// (same pattern as test/leads/LeadDetail.test.tsx mocking leadsApi) so these tests exercise only
// this screen's own rendering and the confirm-lead click guard (never an automatic write), not
// the tRPC wiring itself (that's askApi.test.tsx, mirroring test/leads/leadsApi.test.tsx).
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AgentAnswer } from "@crm/shared";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const askMutate = vi.fn();
const askReset = vi.fn();
let askState: { isPending: boolean; isError: boolean; data: AgentAnswer | undefined } = {
  isPending: false,
  isError: false,
  data: undefined,
};

let runInfo: { runId: string | null } | undefined = { runId: "3" };

const undoMutate = vi.fn();
const confirmLeadsMutate = vi.fn();
let confirmLeadsState: { isPending: boolean } = { isPending: false };
const undoCreatedFn = vi.fn();
let undoState: {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: { deleted: boolean; reason?: string } | undefined;
} = { isPending: false, isSuccess: false, isError: false, data: undefined };

const confirmMutate = vi.fn();
let confirmState: {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
  data?: { leadKey: string; leadId: string };
} = { isPending: false, isSuccess: false, isError: false, error: null };

vi.mock("../../src/routes/Ask/askApi", () => ({
  useAskAgent: () => ({ mutate: askMutate, reset: askReset, ...askState }),
  useConfirmLead: () => ({ mutate: confirmMutate, ...confirmState }),
  useRunInfo: () => ({ data: runInfo }),
  useUndoCreate: () => ({ mutate: undoMutate, ...undoState }),
  useConfirmLeads: () => ({ mutate: confirmLeadsMutate, ...confirmLeadsState }),
  useUndoCreatedLeads: () => undoCreatedFn,
}));

import { AskPanel, type AskPanelProps } from "../../src/routes/Ask/AskPanel";

const MANIFEST_CID = "bafkreihidj4qxsal43nbd3twbobnc4rl3tptu23si3w6wrnwvcn2otkbcy";

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
    claims: [
      { text: "3 properties near Pflugerville have roofs over 20 years old.", citationIds: [1] },
    ],
    citations: [
      {
        id: 1,
        kind: "property",
        tcadId: "0201885122",
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
    counts: {
      matched: 3,
      shown: 1,
      excludedNoCoordinates: 0,
      excludedNoRoofDate: 0,
      truncated: false,
    },
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

/** A non-answer outcome: no claims, citations or proposals. */
function blockedFixture(overrides: Partial<AgentAnswer>): AgentAnswer {
  return answeredFixture({
    claims: [],
    citations: [],
    proposals: undefined,
    counts: {
      matched: 0,
      shown: 0,
      excludedNoCoordinates: 0,
      excludedNoRoofDate: 0,
      truncated: false,
    },
    ...overrides,
  });
}

const QUESTION_LABEL = /^Ask your question in plain English$/;

const panelCallbacks = {
  onFocusCitation: vi.fn(),
  onAnswer: vi.fn(),
  onShowOnMap: vi.fn(),
};

function renderAsk(props: Partial<AskPanelProps> = {}): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <AskPanel
        threadId="thread-1"
        focusedCitation={null}
        layout="pane"
        {...panelCallbacks}
        {...props}
      />
    </MemoryRouter>,
  );
}

function askRoot(): HTMLElement {
  return screen.getByLabelText("Ask");
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  askMutate.mockReset();
  confirmMutate.mockReset();
  askState = { isPending: false, isError: false, data: undefined };
  confirmState = { isPending: false, isSuccess: false, isError: false, error: null };
  runInfo = { runId: "3" };
  undoMutate.mockReset();
  confirmLeadsMutate.mockReset();
  undoCreatedFn.mockReset();
  askReset.mockReset();
  confirmLeadsState = { isPending: false };
  for (const fn of Object.values(panelCallbacks)) fn.mockReset();
  undoState = { isPending: false, isSuccess: false, isError: false, data: undefined };
});

describe("Ask screen", () => {
  it("renders the question input and submits a trimmed question", () => {
    renderAsk();
    const input = screen.getByLabelText(QUESTION_LABEL);
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

  it("starts idle before anything is asked", () => {
    renderAsk();
    expect(askRoot().getAttribute("data-state")).toBe("idle");
  });

  describe("working state (CR finding 20, CrmAskWorking390 / CrmAgentWorking390/1440)", () => {
    it('shows a progress bar, "Working…" and an elapsed timer; data-state="working"', () => {
      vi.useFakeTimers();
      askState = { ...askState, isPending: true };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("working");
      expect(screen.getByRole("progressbar", { name: "Working" })).toBeTruthy();
      expect(screen.getByText("Working…")).toBeTruthy();
      const timer = screen.getByRole("timer");
      expect(timer.textContent).toBe("0 s");
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("timer").textContent).toBe("3 s");
    });

    it("keeps the question readable (read-only, not disabled) while working", () => {
      askState = { ...askState, isPending: true };
      renderAsk();
      const input = screen.getByLabelText(QUESTION_LABEL) as HTMLTextAreaElement;
      expect(input.readOnly).toBe(true);
      expect(input.disabled).toBe(false);
      expect(screen.getByRole("button", { name: "Ask" }).hasAttribute("disabled")).toBe(true);
    });

    it("announces progress through the one polite live region", () => {
      askState = { ...askState, isPending: true };
      renderAsk();
      const live = screen.getByRole("status");
      expect(live.getAttribute("aria-live")).toBe("polite");
      expect(live.textContent).toMatch(/Working on your question/);
    });
  });

  describe("result heading", () => {
    it("moves focus to the result heading and announces it in the live region", () => {
      askState = { ...askState, data: answeredFixture() };
      renderAsk();
      const heading = screen.getByRole("heading", { level: 3 });
      expect(document.activeElement).toBe(heading);
      expect(screen.getByRole("status").textContent).toBe(heading.textContent);
    });
  });

  it('renders an answered response\'s claims and citations, data-state="answer"', () => {
    askState = { ...askState, data: answeredFixture() };
    renderAsk();
    expect(askRoot().getAttribute("data-state")).toBe("answer");
    expect(
      screen.getByText("3 properties near Pflugerville have roofs over 20 years old."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, el) => el?.getAttribute("data-cid") === answeredFixture().citations[0]?.propertyCid,
      ),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open on map" });
    expect(link.getAttribute("href")).toContain(
      encodeURIComponent(answeredFixture().citations[0]?.propertyCid ?? ""),
    );
  });

  it("keys claims by a stable id, so two claims with the same text are both rendered", () => {
    askState = {
      ...askState,
      data: answeredFixture({
        claims: [
          { text: "Same text.", citationIds: [1] },
          { text: "Other text.", citationIds: [1] },
        ],
      }),
    };
    renderAsk();
    const claims = screen.getByRole("list", { name: "Answer" });
    const items = claims.querySelectorAll("[data-claim-id]");
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("data-claim-id")).not.toBe(
      items[1]?.getAttribute("data-claim-id"),
    );
  });

  describe('"How I read this" (CR finding 16)', () => {
    it("shows the plan for an answered outcome", () => {
      askState = { ...askState, data: answeredFixture() };
      renderAsk();
      expect(screen.getByText(/How I read this:/)).toBeTruthy();
      expect(screen.getByText(/within 5 mi of Pflugerville/)).toBeTruthy();
    });

    it.each(["rate_limited", "paused", "timed_out"] as const)(
      "is not shown for %s (no model plan)",
      (outcome) => {
        askState = { ...askState, data: blockedFixture({ outcome }) };
        renderAsk();
        expect(screen.queryByText(/How I read this/)).toBeNull();
      },
    );

    it("is not shown when the agent call itself failed", () => {
      askState = { ...askState, isError: true };
      renderAsk();
      expect(screen.queryByText(/How I read this/)).toBeNull();
      expect(screen.getByRole("alert").textContent).toMatch(/could not answer/);
    });

    it('marks a follow-up whose area was inherited ("area from your last question")', () => {
      askState = {
        ...askState,
        data: answeredFixture({ plan: { ...PLAN, slotSources: { area: "inherited" } } }),
      };
      renderAsk();
      expect(screen.getByText(/area from your last question/i)).toBeTruthy();
    });
  });

  describe("confirm lead (CR finding 16 item 4)", () => {
    it("shows Create lead only for proposed rows, and calls confirmLead only on a click", () => {
      askState = { ...askState, data: answeredFixture() };
      renderAsk();
      expect(screen.getByText("TCAD 0201885122")).toBeTruthy();
      expect(confirmMutate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Create lead" }));
      expect(confirmMutate).toHaveBeenCalledTimes(1);
      const [callArg] = confirmMutate.mock.calls[0] as [{ threadId: string; tcadId: string }];
      expect(callArg.tcadId).toBe("0201885122");
      expect(typeof callArg.threadId).toBe("string");
    });

    it("offers no Create lead for cited rows the answer did not propose", () => {
      askState = { ...askState, data: answeredFixture({ proposals: undefined }) };
      renderAsk();
      expect(screen.queryByRole("button", { name: "Create lead" })).toBeNull();
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

    it.each([
      ["NOT_PROPOSED", /wasn't proposed in this conversation/, true],
      ["NO_COORDINATES", /no published coordinates/, true],
      ["RATE_LIMITED", /Too many lead requests/, false],
    ] as const)("maps %s to a specific message", (appCode, text, disables) => {
      askState = { ...askState, data: answeredFixture() };
      confirmState = { ...confirmState, isError: true, error: { data: { appCode } } };
      renderAsk();
      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.queryByText(/Could not create lead\. Try again\./)).toBeNull();
      const button = screen.getByRole("button", { name: "Create lead" });
      expect(button.hasAttribute("disabled")).toBe(disables);
    });

    it("shows Lead created with a link to Leads on success", () => {
      askState = { ...askState, data: answeredFixture() };
      confirmState = { ...confirmState, isSuccess: true };
      renderAsk();
      expect(screen.getByText("Lead created")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Open Leads" }).getAttribute("href")).toBe("/leads");
    });
  });

  describe("empty results say why (CR finding 16 item 2)", () => {
    it("empty_in_scope names the subject, filters and area from the plan, plus exclusions", () => {
      askState = {
        ...askState,
        data: blockedFixture({
          outcome: "empty_in_scope",
          plan: {
            intent: "find_permits",
            area: { kind: "place", query: "Manor", radiusMi: 1 },
            filters: { statusClass: ["open"], openYearsMin: 10 },
            slotSources: {},
            unsupported: [],
          },
          counts: {
            matched: 0,
            shown: 0,
            excludedNoCoordinates: 0,
            excludedNoRoofDate: 2,
            truncated: false,
          },
          missing: [{ field: "coordinates", reason: "no_coordinates", count: 3 }],
        }),
      };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("no_results");
      expect(
        screen.getByText("No open roofing permits, open 10+ years, within 1 mi of Manor."),
      ).toBeTruthy();
      expect(screen.getByText(/2 properties in the area have no roof date/)).toBeTruthy();
      expect(screen.getByText("Coordinates: No coordinates for this parcel (3 rows)")).toBeTruthy();
      expect(screen.queryByText(/Travis County/)).toBeNull();
    });

    it("field_not_published names the field(s) Task A does not publish", () => {
      askState = {
        ...askState,
        data: blockedFixture({
          outcome: "field_not_published",
          missing: [{ field: "roof material", reason: "not_in_export" }],
        }),
      };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("no_results");
      expect(screen.getByText(/doesn't include roof material/)).toBeTruthy();
    });
  });

  describe("needs_clarification candidates (CR finding 16 item 3)", () => {
    const candidates = [
      { name: "Pflugerville", score: 0.88, match: "fuzzy" as const },
      { name: "Manor", score: 0.84, match: "fuzzy" as const },
    ];

    it('renders candidates as buttons, best first; data-state="low_confidence"', () => {
      askState = {
        ...askState,
        data: blockedFixture({
          outcome: "needs_clarification",
          plan: { ...PLAN, area: { kind: "place", query: "pville", radiusMi: 5 } },
          candidates,
        }),
      };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("low_confidence");
      const group = screen.getByRole("group", { name: "Places I know" });
      const buttons = within(group).getAllByRole("button");
      expect(buttons.map((b) => b.getAttribute("data-place"))).toEqual(["Pflugerville", "Manor"]);
    });

    it("choosing one re-asks in the same thread with the place made explicit", () => {
      askState = {
        ...askState,
        data: blockedFixture({
          outcome: "needs_clarification",
          plan: { ...PLAN, area: { kind: "place", query: "pville", radiusMi: 5 } },
          candidates,
        }),
      };
      renderAsk();
      fireEvent.change(screen.getByLabelText(QUESTION_LABEL), {
        target: { value: "old roofs near pville" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Ask" }));
      const [first] = askMutate.mock.calls[0] as [{ threadId: string }];
      fireEvent.click(screen.getByRole("button", { name: /Use Pflugerville/ }));
      expect(askMutate).toHaveBeenCalledTimes(2);
      const [second] = askMutate.mock.calls[1] as [{ question: string; threadId: string }];
      expect(second.question).toBe("old roofs near Pflugerville");
      expect(second.threadId).toBe(first.threadId);
    });

    it("without candidates, asks to rephrase and invents no buttons", () => {
      askState = { ...askState, data: blockedFixture({ outcome: "needs_clarification" }) };
      renderAsk();
      expect(screen.getByRole("heading", { level: 3 }).textContent).toMatch(
        /couldn't read that question/i,
      );
      expect(screen.queryByText(/How I read this/)).toBeNull();
      expect(screen.queryByRole("group", { name: "Places I know" })).toBeNull();
      expect(screen.queryAllByRole("button", { name: /^Use / })).toHaveLength(0);
    });
  });

  describe("scope outcomes take the place from the plan", () => {
    it("out_of_scope", () => {
      askState = {
        ...askState,
        data: blockedFixture({
          outcome: "out_of_scope",
          plan: { ...PLAN, area: { kind: "place", query: "Round Rock", radiusMi: 5 } },
        }),
      };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("out_of_scope");
      expect(screen.getByText(/“Round Rock” is outside the area this CRM covers/)).toBeTruthy();
    });

    it("not_found", () => {
      askState = {
        ...askState,
        data: blockedFixture({
          outcome: "not_found",
          plan: { ...PLAN, area: { kind: "place", query: "Lakeview Heights", radiusMi: 5 } },
        }),
      };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("not_found");
      expect(screen.getByText(/couldn't find “Lakeview Heights”/)).toBeTruthy();
    });
  });

  describe("system limits", () => {
    it('rate_limited: data-state="throttled", alert, live countdown from retryAfterSec', () => {
      vi.useFakeTimers();
      askState = {
        ...askState,
        data: blockedFixture({ outcome: "rate_limited", retryAfterSec: 3 }),
      };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("throttled");
      expect(screen.getByRole("alert").textContent).toMatch(/Ask again in 3 s/);
      fireEvent.change(screen.getByLabelText(QUESTION_LABEL), { target: { value: "again" } });
      expect(screen.getByRole("button", { name: "Ask" }).hasAttribute("disabled")).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole("alert").textContent).toMatch(/Ask again in 2 s/);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByRole("alert").textContent).toMatch(/You can ask again now/);
      expect(screen.getByRole("button", { name: "Ask" }).hasAttribute("disabled")).toBe(false);
    });

    it("paused: reset time comes from resetsAt, in local time and UTC", () => {
      askState = {
        ...askState,
        data: blockedFixture({ outcome: "paused", resetsAt: "2026-10-25T00:00:00.000Z" }),
      };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("paused");
      expect(screen.getByRole("alert").textContent).toMatch(/2026-10-25 00:00 UTC/);
      expect(screen.queryByText(/00:00 UTC\. *$/)).toBeNull();
    });

    it("timed_out: states the shared limit and offers Try again with the same question", () => {
      askState = { ...askState, data: blockedFixture({ outcome: "timed_out" }) };
      renderAsk();
      expect(askRoot().getAttribute("data-state")).toBe("timed_out");
      expect(screen.getByRole("alert").textContent).toMatch(/Took too long/);
      expect(screen.queryByText(/25 s/)).toBeNull();
      fireEvent.change(screen.getByLabelText(QUESTION_LABEL), { target: { value: "slow one" } });
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      const [arg] = askMutate.mock.calls[0] as [{ question: string }];
      expect(arg.question).toBe("slow one");
    });
  });

  describe("composer (CrmAsk1440)", () => {
    it("names the promoted run it cites, never an invented one", () => {
      renderAsk();
      expect(screen.getByText("Signed in · answers cite CountyLens run 3")).toBeTruthy();
      cleanup();
      runInfo = undefined;
      renderAsk();
      expect(screen.queryByText(/run 3/)).toBeNull();
      expect(screen.getByText(/answers cite the published CountyLens run/)).toBeTruthy();
    });

    it("a suggestion fills the box and asks nothing by itself", () => {
      renderAsk();
      const first = screen.getByRole("list", { name: "Suggestions" }).querySelector("button");
      fireEvent.click(first as HTMLButtonElement);
      const box = screen.getByLabelText(QUESTION_LABEL) as HTMLTextAreaElement;
      expect(box.value).toMatch(/^Show me open roofing permits/);
      expect(askMutate).not.toHaveBeenCalled();
    });

    it("Enter asks, Shift+Enter keeps a new line", () => {
      renderAsk();
      const box = screen.getByLabelText(QUESTION_LABEL);
      fireEvent.change(box, { target: { value: "roofs near Manor" } });
      fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
      expect(askMutate).not.toHaveBeenCalled();
      fireEvent.keyDown(box, { key: "Enter" });
      expect(askMutate).toHaveBeenCalledTimes(1);
    });
  });

  describe("numbered sources (CrmAsk390/768/1440)", () => {
    it("each claim carries the numbers of the sources it cites, and each number has a row", () => {
      askState = { ...askState, data: answeredFixture() };
      renderAsk();
      const ref = screen.getByRole("link", { name: "Source 1" });
      expect(ref.getAttribute("href")).toBe("#ask-source-1");
      const sources = screen.getByRole("list", { name: "Sources" });
      expect(sources.querySelector("#ask-source-1")?.textContent).toMatch(/TCAD 0201885122/);
    });

    it("puts Create lead on the source row of the proposed property", () => {
      askState = { ...askState, data: answeredFixture() };
      renderAsk();
      const row = document.querySelector("#ask-source-1") as HTMLElement;
      expect(within(row).getByRole("button", { name: "Create lead" })).toBeTruthy();
    });

    it("a proposal no claim cites still gets its own Create lead row", () => {
      askState = {
        ...askState,
        data: answeredFixture({ proposals: [{ tcadId: "7777777777", alreadyLead: false }] }),
      };
      renderAsk();
      const list = screen.getByRole("list", { name: "Create lead" });
      expect(within(list).getByText("TCAD 7777777777")).toBeTruthy();
    });
  });

  describe("budget outcomes keep the last real answer (CrmAskThrottled390)", () => {
    it("shows the last answer under the throttle banner and says so", () => {
      const first = answeredFixture();
      askMutate.mockImplementation((_vars, options?: { onSuccess?: (a: AgentAnswer) => void }) =>
        options?.onSuccess?.(first),
      );
      askState = { ...askState, data: first };
      const view = renderAsk();
      fireEvent.change(screen.getByLabelText(QUESTION_LABEL), { target: { value: "first" } });
      fireEvent.click(screen.getByRole("button", { name: "Ask" }));
      askState = {
        ...askState,
        data: blockedFixture({ outcome: "rate_limited", retryAfterSec: 40 }),
      };
      view.rerender(
        <MemoryRouter>
          <AskPanel threadId="thread-1" focusedCitation={null} layout="pane" {...panelCallbacks} />
        </MemoryRouter>,
      );
      expect(screen.getByRole("alert").textContent).toMatch(
        /Ask again in 40 s\. Your last answer, the map and your leads keep working/,
      );
      const last = screen.getByRole("region", { name: "Your last answer" });
      expect(
        within(last).getByText(/3 properties near Pflugerville have roofs over 20 years old/),
      ).toBeTruthy();
    });

    it("with no earlier answer there is nothing to keep and the copy does not claim one", () => {
      askState = {
        ...askState,
        data: blockedFixture({ outcome: "rate_limited", retryAfterSec: 40 }),
      };
      renderAsk();
      expect(screen.queryByRole("region", { name: "Your last answer" })).toBeNull();
      expect(screen.getByRole("alert").textContent).toMatch(/^Ask again in 40 s\. The map and/);
    });
  });

  describe("initialQuestion prefill (from ?q=)", () => {
    const Q = "Show me open roofing permits older than five years within five miles of Manor";

    it("prefills the question box and focuses it", () => {
      renderAsk({ initialQuestion: Q });
      const box = screen.getByLabelText(QUESTION_LABEL) as HTMLTextAreaElement;
      expect(box.value).toBe(Q);
      expect(document.activeElement).toBe(box);
    });

    it("never asks by itself", () => {
      renderAsk({ initialQuestion: Q });
      expect(askMutate).not.toHaveBeenCalled();
      expect(askRoot().getAttribute("data-state")).toBe("idle");
    });

    it("trims the text", () => {
      renderAsk({ initialQuestion: "  roofs near Manor  " });
      expect((screen.getByLabelText(QUESTION_LABEL) as HTMLTextAreaElement).value).toBe(
        "roofs near Manor",
      );
    });

    it.each([
      ["empty", ""],
      ["blank", "   "],
      ["oversize", "x".repeat(501)],
    ])("ignores an %s question", (_name, value) => {
      renderAsk({ initialQuestion: value });
      expect((screen.getByLabelText(QUESTION_LABEL) as HTMLTextAreaElement).value).toBe("");
      expect(askMutate).not.toHaveBeenCalled();
    });

    it("accepts exactly 500 characters", () => {
      renderAsk({ initialQuestion: "y".repeat(500) });
      expect((screen.getByLabelText(QUESTION_LABEL) as HTMLTextAreaElement).value).toHaveLength(
        500,
      );
    });
  });

  describe("Undo after Create lead (leads.undoCreate)", () => {
    const created = { leadKey: "48453:0201885122", leadId: "lead-9" };

    it("sends the created lead's key and id, and nothing before the click", () => {
      askState = { ...askState, data: answeredFixture() };
      confirmState = { ...confirmState, isSuccess: true, data: created };
      renderAsk();
      expect(undoMutate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(undoMutate).toHaveBeenCalledWith(created);
    });

    it("says the lead was removed, and drops Undo and Open Leads", () => {
      askState = { ...askState, data: answeredFixture() };
      confirmState = { ...confirmState, isSuccess: true, data: created };
      undoState = { ...undoState, isSuccess: true, data: { deleted: true } };
      renderAsk();
      expect(screen.getByText("Lead removed")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Open Leads" })).toBeNull();
    });

    it("explains a refusal honestly and keeps the lead", () => {
      askState = { ...askState, data: answeredFixture() };
      confirmState = { ...confirmState, isSuccess: true, data: created };
      undoState = { ...undoState, isSuccess: true, data: { deleted: false, reason: "CHANGED" } };
      renderAsk();
      expect(screen.getByText("Lead kept: it was updated after it was created.")).toBeTruthy();
      expect(screen.getByText("Lead created")).toBeTruthy();
    });

    it("says the lead is still saved when the undo call fails", () => {
      askState = { ...askState, data: answeredFixture() };
      confirmState = { ...confirmState, isSuccess: true, data: created };
      undoState = { ...undoState, isError: true };
      renderAsk();
      expect(screen.getByText("Couldn’t undo. The lead is still saved.")).toBeTruthy();
    });
  });

  describe("Answer | Matches tabs and the map hooks", () => {
    const pinned = (over: Partial<AgentAnswer> = {}): AgentAnswer => {
      const base = answeredFixture();
      const cite = {
        ...(base.citations[0] as AgentAnswer["citations"][number]),
        lat: 30.44,
        lon: -97.62,
      };
      return answeredFixture({
        citations: [cite],
        rows: [
          {
            propertyCid: cite.propertyCid ?? "",
            tcadId: "0201885122",
            lat: 30.44,
            lon: -97.62,
            citationId: 1,
            nearPlace: { name: "Pflugerville", distanceMi: 1.26 },
            roofAgeYears: 24,
            roofAgeBasis: "permit",
            permit: { permitCid: "p1", number: "2019-1", statusClass: "stalled", openDays: 2338 },
            contractorResolution: "unresolved",
            missing: [{ field: "contractor_name_raw", reason: "no_lexicon_carrier" }],
          },
        ],
        ...over,
      });
    };

    it("tells the map about each new answer, and about none before the first", () => {
      renderAsk();
      expect(panelCallbacks.onAnswer).toHaveBeenLastCalledWith(null);
      cleanup();
      panelCallbacks.onAnswer.mockReset();
      const answer = pinned();
      askState = { ...askState, data: answer };
      renderAsk();
      expect(panelCallbacks.onAnswer).toHaveBeenLastCalledWith(answer);
    });

    it("shows the Matches count and lists each row with its facts", () => {
      askState = { ...askState, data: pinned() };
      renderAsk();
      const tab = screen.getByRole("tab", { name: "Matches 1" });
      fireEvent.click(tab);
      const list = screen.getByRole("list", { name: "Matches" });
      const text = list.textContent ?? "";
      expect(text).toContain("TCAD 0201885122");
      expect(text).toContain("near Pflugerville · 1.3 mi");
      expect(text).toContain("Roof 24 yrs · Last reroof permit");
      expect(text).toContain("Stalled · derived: no status in source · open 6.4 yrs");
      expect(text).toContain("Contractor: Unresolved");
      expect(text).toContain("Contractor name as printed");
      expect(within(list).getByRole("button", { name: "Create lead" })).toBeTruthy();
      expect(within(list).getByRole("link", { name: "Open on map" })).toBeTruthy();
    });

    it("says why Matches is empty when the answer carries no rows", () => {
      askState = { ...askState, data: answeredFixture() };
      renderAsk();
      fireEvent.click(screen.getByRole("tab", { name: "Matches 0" }));
      expect(screen.getByText(/did not include a list of matches/)).toBeTruthy();
    });

    it("Show on map asks the map to fit the pins, and is off with none", () => {
      askState = { ...askState, data: pinned() };
      renderAsk();
      fireEvent.click(screen.getByRole("button", { name: "Show on map" }));
      expect(panelCallbacks.onShowOnMap).toHaveBeenCalledTimes(1);
      cleanup();
      askState = { ...askState, data: answeredFixture() };
      renderAsk();
      expect(screen.getByRole("button", { name: "Show on map" }).hasAttribute("disabled")).toBe(
        true,
      );
      expect(
        screen.getByText("No map pins: none of the cited properties has published coordinates."),
      ).toBeTruthy();
    });

    it("clicking a citation number focuses it, and the focused source row is marked", () => {
      askState = { ...askState, data: pinned() };
      const view = renderAsk();
      fireEvent.click(screen.getByRole("link", { name: "Source 1" }));
      expect(panelCallbacks.onFocusCitation).toHaveBeenCalledWith(1);
      view.rerender(
        <MemoryRouter>
          <AskPanel threadId="thread-1" focusedCitation={1} layout="pane" {...panelCallbacks} />
        </MemoryRouter>,
      );
      expect(document.querySelector("#ask-source-1")?.getAttribute("data-focused")).toBe("true");
    });

    it("marks its layout for the map to size it", () => {
      renderAsk({ layout: "sheet" });
      expect(askRoot().getAttribute("data-layout")).toBe("sheet");
    });
  });

  describe("Create leads for all n (confirmation first)", () => {
    const three = (): AgentAnswer =>
      answeredFixture({
        proposals: [
          { tcadId: "0201885122", alreadyLead: false },
          { tcadId: "0210577629", alreadyLead: true, leadId: "lead-1" },
          { tcadId: "0200314187", alreadyLead: false },
        ],
        rows: [
          {
            propertyCid: "c1",
            tcadId: "0201885122",
            lat: 30,
            lon: -97,
            missing: [],
            roofAgeYears: 31,
          },
          { propertyCid: "c2", tcadId: "0210577629", lat: 30, lon: -97, missing: [] },
          {
            propertyCid: "c3",
            tcadId: "0200314187",
            missing: [{ field: "lat_lon", reason: "no_coordinates" }],
          },
        ],
      });

    it("opens a confirmation sheet and creates nothing until Create is pressed", () => {
      askState = { ...askState, data: three() };
      renderAsk();
      fireEvent.click(screen.getByRole("button", { name: "Create leads for all 3" }));
      const dialog = screen.getByRole("dialog");
      expect(confirmLeadsMutate).not.toHaveBeenCalled();
      expect(within(dialog).getByText("Create 1 lead?")).toBeTruthy();
      expect(within(dialog).getByText("Already a lead · skipped")).toBeTruthy();
      expect(within(dialog).getByText("No published coordinates · skipped")).toBeTruthy();
      expect(within(dialog).getByText("Main signal: Roof 31 yrs")).toBeTruthy();
    });

    it("Cancel closes it without creating", () => {
      askState = { ...askState, data: three() };
      renderAsk();
      fireEvent.click(screen.getByRole("button", { name: "Create leads for all 3" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(confirmLeadsMutate).not.toHaveBeenCalled();
    });

    it("sends only the creatable ids with the thread, then reports and offers Undo", async () => {
      askState = { ...askState, data: three() };
      confirmLeadsMutate.mockImplementation((_vars, options) =>
        options.onSuccess({
          created: [{ tcadId: "0201885122", leadKey: "48453:0201885122", leadId: "lead-7" }],
          alreadyLeads: [],
          failed: [],
        }),
      );
      undoCreatedFn.mockResolvedValue({ undone: 1, refused: [], failed: 0 });
      renderAsk();
      fireEvent.click(screen.getByRole("button", { name: "Create leads for all 3" }));
      fireEvent.click(screen.getByRole("button", { name: "Create 1 lead" }));
      expect(confirmLeadsMutate.mock.calls[0]?.[0]).toEqual({
        threadId: "thread-1",
        tcadIds: ["0201885122"],
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("1 lead created · 1 already a lead")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await vi.waitFor(() => expect(screen.getByText("Undid 1 lead")).toBeTruthy());
      expect(undoCreatedFn).toHaveBeenCalledWith([
        { leadKey: "48453:0201885122", leadId: "lead-7" },
      ]);
    });

    it("keeps the sheet open with the typed reason when the server refuses", () => {
      askState = { ...askState, data: three() };
      confirmLeadsMutate.mockImplementation((_vars, options) =>
        options.onError({ data: { appCode: "RATE_LIMITED" } }),
      );
      renderAsk();
      fireEvent.click(screen.getByRole("button", { name: "Create leads for all 3" }));
      fireEvent.click(screen.getByRole("button", { name: "Create 1 lead" }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toMatch(/Too many lead requests/);
    });

    it("rows created in bulk say Lead created instead of offering Create lead again", () => {
      askState = { ...askState, data: three() };
      confirmLeadsMutate.mockImplementation((_vars, options) =>
        options.onSuccess({
          created: [{ tcadId: "0201885122", leadKey: "k", leadId: "l" }],
          alreadyLeads: [],
          failed: [],
        }),
      );
      renderAsk();
      fireEvent.click(screen.getByRole("button", { name: "Create leads for all 3" }));
      fireEvent.click(screen.getByRole("button", { name: "Create 1 lead" }));
      expect(screen.getByText("Lead created")).toBeTruthy();
    });
  });

  it("a new thread forgets the last answer", () => {
    askState = { ...askState, data: answeredFixture() };
    const view = renderAsk();
    view.rerender(
      <MemoryRouter>
        <AskPanel threadId="thread-2" focusedCitation={null} layout="pane" {...panelCallbacks} />
      </MemoryRouter>,
    );
    expect(askReset).toHaveBeenCalledTimes(1);
  });
});
