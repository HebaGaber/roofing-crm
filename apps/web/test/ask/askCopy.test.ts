// B-09 review (CR-B-09 findings 16 and 20): the Ask screen's wording is derived from the answer itself —
// `plan`, `counts`, `missing[]`, `retryAfterSec`, `resetsAt`, `candidates` — never hard-coded
// place names, limits or reset times. These are the pure helpers behind that copy.
import { AGENT_TURN_LIMIT_MS, type AgentAnswer } from "@crm/shared";
import { describe, expect, it } from "vitest";
import {
  AGENT_TURN_LIMIT_SEC,
  clarifyQuestion,
  confirmErrorCopy,
  emptyExplanation,
  exclusionNotes,
  fieldNotPublishedText,
  hasModelPlan,
  missingText,
  pausedText,
  planSummary,
  throttleText,
  timedOutText,
} from "../../src/routes/Ask/askCopy";

type Plan = AgentAnswer["plan"];

const PERMIT_PLAN: Plan = {
  intent: "find_permits",
  area: {
    kind: "place",
    query: "pflugervile",
    radiusMi: 5,
    resolved: {
      name: "Pflugerville",
      lat: 30.44,
      lon: -97.62,
      source: "travis-places@1.0.0",
      sha256: "abc",
      match: "fuzzy",
      score: 0.95,
    },
  },
  filters: { statusClass: ["open"], openYearsMin: 5 },
  slotSources: { area: "stated", statusClass: "stated", openYearsMin: "stated" },
  unsupported: [],
};

function answer(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    outcome: "empty_in_scope",
    claims: [],
    citations: [],
    plan: PERMIT_PLAN,
    resultSetId: "rs",
    counts: {
      matched: 0,
      shown: 0,
      excludedNoCoordinates: 0,
      excludedNoRoofDate: 0,
      truncated: false,
    },
    missing: [],
    trace: {
      traceId: "t",
      modelId: "m",
      promptVersion: "p",
      rankVersion: "r",
      toolSteps: 1,
      modelCalls: 1,
    },
    ...overrides,
  };
}

describe("hasModelPlan (CR finding 16: 'How I read this' only when a model plan exists)", () => {
  it.each([
    "answered",
    "empty_in_scope",
    "field_not_published",
    "not_found",
    "out_of_scope",
  ] as const)("is true for %s", (outcome) => {
    expect(hasModelPlan(answer({ outcome }))).toBe(true);
  });

  it.each(["rate_limited", "paused", "timed_out"] as const)("is false for %s", (outcome) => {
    expect(hasModelPlan(answer({ outcome }))).toBe(false);
  });

  it("is true for needs_clarification from the scope gate (candidates sent, even empty)", () => {
    expect(hasModelPlan(answer({ outcome: "needs_clarification", candidates: [] }))).toBe(true);
  });

  it("is false for needs_clarification after an unreadable plan (no candidates field)", () => {
    expect(hasModelPlan(answer({ outcome: "needs_clarification" }))).toBe(false);
  });
});

describe("planSummary", () => {
  it("uses the resolved place name, radius and filters from the plan", () => {
    expect(planSummary(PERMIT_PLAN)).toBe(
      "open roofing permits, open 5+ years, within 5 mi of Pflugerville",
    );
  });

  it("falls back to what the rep typed when the place was not resolved", () => {
    const plan: Plan = {
      ...PERMIT_PLAN,
      area: { kind: "place", query: "Lakeview Heights", radiusMi: 3 },
    };
    expect(planSummary(plan)).toContain("within 3 mi of Lakeview Heights");
  });

  it("names a county-wide area without a radius", () => {
    const plan: Plan = {
      ...PERMIT_PLAN,
      intent: "find_properties",
      area: { kind: "county", query: "Travis County", radiusMi: 25 },
      filters: { roofAgeMinYears: 20 },
    };
    expect(planSummary(plan)).toBe("properties, roof 20+ years old, in Travis County");
  });
});

describe("emptyExplanation (CR finding 16: empty copy says why)", () => {
  it("states the subject, filters and area actually searched", () => {
    expect(emptyExplanation(answer())).toBe(
      "No open roofing permits, open 5+ years, within 5 mi of Pflugerville.",
    );
  });

  it("does not hard-code a place: a different plan yields a different sentence", () => {
    const plan: Plan = {
      ...PERMIT_PLAN,
      intent: "find_properties",
      area: { kind: "place", query: "Manor", radiusMi: 1 },
      filters: { roofAgeMinYears: 30 },
    };
    expect(emptyExplanation(answer({ plan }))).toBe(
      "No properties, roof 30+ years old, within 1 mi of Manor.",
    );
  });
});

describe("exclusionNotes", () => {
  it("explains counted exclusions with their numbers", () => {
    const notes = exclusionNotes(
      answer({
        counts: {
          matched: 0,
          shown: 0,
          excludedNoCoordinates: 2,
          excludedNoRoofDate: 1,
          truncated: false,
        },
      }),
    );
    expect(notes).toEqual([
      "1 property in the area has no roof date, so the roof-age filter left it out.",
      "2 indexed properties have no coordinates, so a radius search can't place them.",
    ]);
  });

  it("is empty when nothing was excluded", () => {
    expect(exclusionNotes(answer())).toEqual([]);
  });
});

describe("missingText", () => {
  it("uses the contract label and the evidence-row count", () => {
    expect(missingText({ field: "coordinates", reason: "no_coordinates", count: 4 })).toBe(
      "coordinates: No coordinates for this parcel (4 rows)",
    );
  });

  it("labels the plan-level no_free_text reason (not in the row-reason list)", () => {
    expect(missingText({ field: "permit description", reason: "no_free_text" })).toBe(
      "permit description: Free text is not published",
    );
  });

  it("singular row count", () => {
    expect(missingText({ field: "roof date", reason: "no_roof_date", count: 1 })).toBe(
      "roof date: No roof date found (1 row)",
    );
  });
});

describe("fieldNotPublishedText", () => {
  it("names each unpublished field and that Task A does not publish it", () => {
    const text = fieldNotPublishedText(
      answer({
        outcome: "field_not_published",
        missing: [
          { field: "contractor license", reason: "no_lexicon_carrier" },
          { field: "permit description", reason: "not_in_export" },
        ],
      }),
    );
    expect(text).toBe(
      "Task A's published data (CountyLens) doesn't include contractor license or permit " +
        "description, so I can't filter on them. Nothing was searched.",
    );
  });

  it("singular", () => {
    const text = fieldNotPublishedText(
      answer({
        outcome: "field_not_published",
        missing: [{ field: "roof material", reason: "not_in_export" }],
      }),
    );
    expect(text).toContain("doesn't include roof material, so I can't filter on it.");
  });
});

describe("throttleText (countdown from retryAfterSec)", () => {
  it("counts down in seconds", () => {
    expect(throttleText(40)).toBe(
      "Ask again in 40 s. Your last answer, the map and your leads keep working.",
    );
  });
  it("says you can ask again at zero", () => {
    expect(throttleText(0)).toBe("You can ask again now.");
  });
  it("says why when the wait was not sent", () => {
    expect(throttleText(undefined)).toBe(
      "Wait a moment, then ask again. This answer didn't include the wait time.",
    );
  });
});

describe("pausedText (reset time from resetsAt, local + UTC)", () => {
  it("renders the viewer's local time and the UTC time", () => {
    expect(
      pausedText("2026-10-25T00:00:00.000Z", { locale: "en-US", timeZone: "America/Chicago" }),
    ).toBe(
      "Today's question budget is used up. Asking resumes Oct 24, 2026, 7:00 PM your time " +
        "(2026-10-25 00:00 UTC). Map, filters and leads keep working.",
    );
  });
  it("says why when the reset time was not sent", () => {
    expect(pausedText(undefined)).toBe(
      "Today's question budget is used up. This answer didn't include the reset time. Map, " +
        "filters and leads keep working.",
    );
  });
});

describe("timedOutText", () => {
  it("takes the limit from the shared constant, not a literal", () => {
    expect(timedOutText()).toContain(`${AGENT_TURN_LIMIT_SEC} s limit`);
  });

  it("derives the seconds from @crm/shared's AGENT_TURN_LIMIT_MS (the server's abort timer)", () => {
    expect(AGENT_TURN_LIMIT_SEC).toBe(AGENT_TURN_LIMIT_MS / 1000);
    expect(timedOutText()).toContain(`${AGENT_TURN_LIMIT_MS / 1000} s limit`);
  });
});

describe("clarifyQuestion (re-ask with the chosen place made explicit)", () => {
  it("replaces the ambiguous place the rep typed with the chosen candidate", () => {
    const plan: Plan = { ...PERMIT_PLAN, area: { kind: "place", query: "pville", radiusMi: 5 } };
    expect(clarifyQuestion("open permits within 5 miles of Pville", plan, "Pflugerville")).toBe(
      "open permits within 5 miles of Pflugerville",
    );
  });

  it("appends the place when the typed text is not in the question", () => {
    const plan: Plan = { ...PERMIT_PLAN, area: { kind: "place", query: "", radiusMi: 5 } };
    expect(clarifyQuestion("old roofs nearby", plan, "Manor")).toBe(
      "old roofs nearby (place: Manor)",
    );
  });

  it("treats regex characters in the typed place literally", () => {
    const plan: Plan = { ...PERMIT_PLAN, area: { kind: "place", query: "st. (x)", radiusMi: 5 } };
    expect(clarifyQuestion("roofs near st. (x)", plan, "Sunset Valley")).toBe(
      "roofs near Sunset Valley",
    );
  });
});

describe("confirmErrorCopy (typed confirmLead errors)", () => {
  const err = (appCode?: string, code?: string) => ({ data: { appCode, code } });

  it("NOT_PROPOSED is specific and not retryable", () => {
    const copy = confirmErrorCopy(err("NOT_PROPOSED", "FORBIDDEN"));
    expect(copy.text).toMatch(/wasn't proposed in this conversation/);
    expect(copy.retryable).toBe(false);
    expect(copy.status).toBe("error");
  });

  it("NO_COORDINATES says the property has no published coordinates", () => {
    const copy = confirmErrorCopy(err("NO_COORDINATES", "PRECONDITION_FAILED"));
    expect(copy.text).toMatch(/no published coordinates/);
    expect(copy.retryable).toBe(false);
  });

  it("RATE_LIMITED asks to wait and is retryable", () => {
    const copy = confirmErrorCopy(err("RATE_LIMITED", "TOO_MANY_REQUESTS"));
    expect(copy.text).toMatch(/Too many lead requests/);
    expect(copy.retryable).toBe(true);
  });

  it("ALREADY_EXISTS is an info outcome, not a failure", () => {
    const copy = confirmErrorCopy(err("ALREADY_EXISTS", "CONFLICT"));
    expect(copy.status).toBe("info");
    expect(copy.text).toBe("Already a lead");
  });

  it("anything else says nothing was saved", () => {
    const copy = confirmErrorCopy(new Error("boom"));
    expect(copy.text).toBe("Couldn't create the lead. Nothing was saved. Try again.");
    expect(copy.retryable).toBe(true);
  });
});
