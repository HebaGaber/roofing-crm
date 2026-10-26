// B-09 GAP-3: a question that filters on a field the index does not publish (owner location is
// `not_in_export` for every Run 2 property) must never be answered by applying that filter and
// returning "none". The server drops the filter, records it as unsupported with reason
// not_in_export, and shows the rest of the matches labelled as not narrowed by it.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import type { QueryPlan } from "@crm/shared";
import { dropUnpublishedFilters, runAsk, type RunAskInput } from "../../src/agent/composeAnswer.js";
import { createPlaceResolver } from "../../src/services/agent/placeResolver.js";
import {
  FakeLeadIndex,
  emptyLeadRepo,
  planText,
  property,
  scriptedModel,
} from "../support/agentFixtures.js";

const obs = createObservability("crm-api-test");
const G4 =
  "Which homes near Lakeway haven't changed owners in 10+ years and have owners outside the area?";
const NOT_JSON = "not json";

function ask(texts: readonly string[], index: FakeLeadIndex, extra: Partial<RunAskInput> = {}) {
  const model = scriptedModel(texts);
  const run = runAsk({
    model,
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver: createPlaceResolver(),
    question: G4,
    traceId: "t",
    obs,
    ...extra,
  });
  return { run, model };
}

const plan = (filters: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  planText({
    intent: "find_properties",
    area: { kind: "place", query: "Lakeway", radiusMi: 5 },
    filters,
    slotSources: Object.fromEntries(Object.keys(filters).map((k) => [k, "stated"])),
    ...extra,
  });

describe("dropUnpublishedFilters", () => {
  const base: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Lakeway", radiusMi: 5 },
    filters: { tenureYearsMin: 10, ownerAreaClass: ["out_of_area"] },
    slotSources: { tenureYearsMin: "stated", ownerAreaClass: "stated" },
    unsupported: [],
  };

  it("removes ownerAreaClass and its slot source, adds one not_in_export entry", () => {
    const out = dropUnpublishedFilters(base);
    expect(out.filters).toEqual({ tenureYearsMin: 10 });
    expect(out.slotSources).toEqual({ tenureYearsMin: "stated" });
    expect(out.unsupported).toHaveLength(1);
    expect(out.unsupported[0]).toMatchObject({ reason: "not_in_export" });
    expect(out.unsupported[0]?.constraint).toMatch(/owner/i);
  });

  it("does not duplicate an entry the model already made, and leaves other plans alone", () => {
    const already = {
      ...base,
      unsupported: [{ constraint: "owners outside the area", reason: "not_in_export" as const }],
    };
    expect(dropUnpublishedFilters(already).unsupported).toHaveLength(1);
    const clean = {
      ...base,
      filters: { tenureYearsMin: 10 },
      slotSources: { tenureYearsMin: "stated" as const },
    };
    expect(dropUnpublishedFilters(clean)).toEqual(clean);
  });
});

describe("runAsk with an unpublished filter (G4)", () => {
  it("searches without the owner filter, labels the answer, and flags the gap in missing", async () => {
    const index = new FakeLeadIndex([property({ isLongTenure: true })]);
    const { run } = ask(
      [plan({ tenureYearsMin: 10, ownerAreaClass: ["out_of_area"] }), NOT_JSON],
      index,
    );
    const answer = await run;
    expect(index.searchPropertiesCalls[0]).not.toHaveProperty("ownerAreaClass");
    expect(answer.outcome).toBe("answered");
    expect(answer.plan.filters.ownerAreaClass).toBeUndefined();
    expect(answer.plan.unsupported[0]).toMatchObject({ reason: "not_in_export" });
    expect(answer.missing.some((m) => /owner/i.test(m.field) && m.reason === "not_in_export")).toBe(
      true,
    );
    expect(answer.claims[0]?.text).toMatch(/not narrowed by owner location/i);
    expect(answer.claims[0]?.text).toMatch(/owner location is not published/i);
  });

  it("zero matches after the remaining filters is empty_in_scope that still states the gap", async () => {
    const index = new FakeLeadIndex([]);
    const { run } = ask([plan({ tenureYearsMin: 10, ownerAreaClass: ["out_of_area"] })], index);
    const answer = await run;
    expect(answer.outcome).toBe("empty_in_scope");
    expect(answer.claims).toHaveLength(0);
    expect(answer.missing.some((m) => /owner/i.test(m.field))).toBe(true);
  });

  it("an owner-only question is field_not_published with no search", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask([plan({ ownerAreaClass: ["out_of_area"] })], index);
    const answer = await run;
    expect(answer.outcome).toBe("field_not_published");
    expect(index.searchPropertiesCalls).toHaveLength(0);
    expect(answer.missing.some((m) => /owner/i.test(m.field) && m.reason === "not_in_export")).toBe(
      true,
    );
  });

  it("a plan the model made correctly (owner in unsupported, tenure only) behaves the same", async () => {
    const index = new FakeLeadIndex([property({ isLongTenure: true })]);
    const { run } = ask(
      [
        plan(
          { tenureYearsMin: 10 },
          { unsupported: [{ constraint: "owners outside the area", reason: "not_in_export" }] },
        ),
        NOT_JSON,
      ],
      index,
    );
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.plan.unsupported).toHaveLength(1);
    expect(answer.claims[0]?.text).toMatch(/not narrowed by owner location/i);
  });

  it("a question without an unpublished filter gets no such label", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 30 })]);
    const { run } = ask([plan({ roofAgeMinYears: 20 }), NOT_JSON], index);
    const answer = await run;
    expect(answer.claims[0]?.text).not.toMatch(/owner location/i);
  });
});

describe("filters the search does not apply (roofConfidenceMin, kind)", () => {
  const base: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Lakeway", radiusMi: 5 },
    filters: { roofAgeMinYears: 20, roofConfidenceMin: "high", kind: "commercial" },
    slotSources: { roofAgeMinYears: "stated", roofConfidenceMin: "stated", kind: "stated" },
    unsupported: [],
  };

  it("moves both to unsupported as not_in_export and removes them from filters", () => {
    const out = dropUnpublishedFilters(base);
    expect(out.filters).toEqual({ roofAgeMinYears: 20 });
    expect(out.slotSources).toEqual({ roofAgeMinYears: "stated" });
    expect(out.unsupported.map((u) => u.reason)).toEqual(["not_in_export", "not_in_export"]);
    expect(out.unsupported[0]?.constraint).toMatch(/confidence/i);
    expect(out.unsupported[1]?.constraint).toMatch(/commercial/i);
  });

  it("the answer says they were not applied, and the DATA does not echo them as filters", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 30 })]);
    const { run, model } = ask(
      [plan({ roofAgeMinYears: 20, roofConfidenceMin: "high", kind: "commercial" }), NOT_JSON],
      index,
    );
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.claims[0]?.text).toMatch(/not narrowed by roof age confidence or property type/i);
    const composePrompt = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(composePrompt).not.toContain("roofConfidenceMin");
    expect(index.searchPropertiesCalls[0]).not.toHaveProperty("roofConfidenceMin");
  });
});
