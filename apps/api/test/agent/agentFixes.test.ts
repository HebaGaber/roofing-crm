// B-09 Run 3.1 golden re-run defects 2 to 4 (docs/evidence/B-09.md): the roof-age basis is always
// disclosed, a permit question with no permit number is a list not a lookup, and a place named in a
// thread follow-up never inherits the thread's previous place. The model is scripted throughout.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import type { QueryPlan } from "@crm/shared";
import {
  applyInheritance,
  repairLookupPermitWithoutNumber,
  repairPlanFromQuestion,
  roofBasisPhrase,
  runAsk,
  type RunAskInput,
} from "../../src/agent/composeAnswer.js";
import { createPlaceResolver } from "../../src/services/agent/placeResolver.js";
import {
  FakeLeadIndex,
  emptyLeadRepo,
  permit,
  planText,
  property,
  scriptedModel,
} from "../support/agentFixtures.js";

const obs = createObservability("crm-api-test");
const NOT_JSON = "not json";
const compose = (claims: unknown[]) => JSON.stringify({ claims, citations: [] });

function ask(
  question: string,
  texts: readonly string[],
  index: FakeLeadIndex,
  extra: Partial<RunAskInput> = {},
) {
  const model = scriptedModel(texts);
  const run = runAsk({
    model,
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver: createPlaceResolver(),
    question,
    traceId: "t",
    obs,
    ...extra,
  });
  return { run, model };
}

const ROOF_Q = "Which properties within 5 miles of Pflugerville have roofs older than 15 years?";
const roofPlan = planText({
  intent: "find_properties",
  area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
  filters: { roofAgeMinYears: 15 },
  slotSources: { roofAgeMinYears: "stated", radiusMi: "stated" },
});

describe("defect 2: roof-age basis is disclosed in claim text", () => {
  it("roofBasisPhrase names the year built, a closed permit, or both", () => {
    const built = { roofAgeYears: 30, roofAgeBasis: "built_year" as const };
    const byPermit = { roofAgeYears: 30, roofAgeBasis: "permit" as const };
    expect(roofBasisPhrase([built])).toBe("roof age estimated from the year built");
    expect(roofBasisPhrase([byPermit])).toBe("roof age from a closed roofing permit");
    expect(roofBasisPhrase([built, byPermit])).toMatch(/closed roofing permit.*year built/);
    expect(roofBasisPhrase([{ roofAgeYears: null, roofAgeBasis: "built_year" }])).toBe("");
    expect(roofBasisPhrase([])).toBe("");
  });

  it("counts-only template path: the claim says the age is estimated from the year built", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "built_year" })]);
    const { run } = ask(ROOF_Q, [roofPlan, NOT_JSON], index);
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.claims[0]?.text).toMatch(
      /roof at least 15 years old \(roof age estimated from the year built\)/,
    );
  });

  it("template path with a permit-based age says it comes from a closed roofing permit", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "permit" })]);
    const { run } = ask(ROOF_Q, [roofPlan, NOT_JSON], index);
    const answer = await run;
    expect(answer.claims[0]?.text).toMatch(/closed roofing permit/);
    expect(answer.claims[0]?.text).not.toMatch(/year built/);
  });

  it("a model claim without the basis gets it appended; numbers still verify strictly", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "built_year" })]);
    const { run } = ask(
      ROOF_Q,
      [roofPlan, compose([{ text: "R-0001 has a 32 year old roof.", citationIds: [1] }])],
      index,
    );
    const answer = await run;
    expect(answer.claims[0]?.text).toMatch(
      /^R-0001 has a 32 year old roof\. Roof age estimated from the year built\.$/,
    );
  });

  it("a model claim that already discloses is left alone", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "built_year" })]);
    const text = "R-0001's roof is about 32 years old, estimated from the year built.";
    const { run } = ask(ROOF_Q, [roofPlan, compose([{ text, citationIds: [1] }])], index);
    const answer = await run;
    expect(answer.claims[0]?.text).toBe(text);
  });

  it("a claim with a wrong roof age is still dropped (verification stays strict)", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "built_year" })]);
    const { run } = ask(
      ROOF_Q,
      [roofPlan, compose([{ text: "R-0001 has a 41 year old roof.", citationIds: [1] }])],
      index,
    );
    const answer = await run;
    expect(answer.claims.map((c) => c.text).join(" ")).not.toMatch(/41/);
    expect(answer.claims[0]?.text).toMatch(/year built/);
  });

  it("a permit question gets no roof-basis sentence", async () => {
    const index = new FakeLeadIndex([property()], [permit()]);
    const { run } = ask(
      "Show me open roofing permits within 5 miles of Manor",
      [
        planText({
          intent: "find_permits",
          area: { kind: "place", query: "Manor", radiusMi: 5 },
          filters: { statusClass: ["open"] },
          slotSources: { statusClass: "stated", radiusMi: "stated" },
        }),
        NOT_JSON,
      ],
      index,
    );
    const answer = await run;
    expect(answer.claims[0]?.text).not.toMatch(/year built/);
  });

  it("the compose prompt tells the model to disclose the basis", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run, model } = ask(ROOF_Q, [roofPlan, NOT_JSON], index);
    await run;
    const system = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(system).toMatch(/estimated from the year/);
  });
});

describe("defect 3: a permit question with no permit number is find_permits", () => {
  const Q =
    "Who is the listed contractor on the oldest stalled roofing permit within 2 miles of Austin?";
  const lookup: QueryPlan = {
    intent: "lookup_permit",
    area: { kind: "place", query: "Austin", radiusMi: 5 },
    filters: {},
    slotSources: {},
    unsupported: [],
  };

  it("repairs lookup_permit to find_permits with place, radius and status carried", () => {
    const out = repairLookupPermitWithoutNumber(lookup, Q);
    expect(out).toMatchObject({
      intent: "find_permits",
      area: { kind: "place", query: "Austin", radiusMi: 2 },
      filters: { statusClass: ["stalled"] },
      slotSources: { statusClass: "stated", area: "stated", radiusMi: "stated" },
    });
    expect(out?.filters.permitNumber).toBeUndefined();
  });

  it("takes the place from the question when the plan left area.query blank or the sentence", () => {
    const blank = { ...lookup, area: { ...lookup.area, query: "" } };
    expect(repairLookupPermitWithoutNumber(blank, Q)?.area.query).toBe("Austin");
    const sentence = { ...lookup, area: { ...lookup.area, query: Q } };
    expect(repairLookupPermitWithoutNumber(sentence, Q)?.area.query).toBe("Austin");
  });

  it("goes through repairPlanFromQuestion and records the repair", () => {
    const out = repairPlanFromQuestion(lookup, Q);
    expect(out.plan.intent).toBe("find_permits");
    expect(out.repairs.join(" ")).toMatch(/lookup_permit -> find_permits/);
  });

  it("leaves a real permit lookup alone (number in the plan, the question, or area.query)", () => {
    const withNumber = { ...lookup, filters: { permitNumber: "1982-009789 BP" } };
    expect(repairLookupPermitWithoutNumber(withNumber, Q)).toBeUndefined();
    const asked = "What is the status of permit 1982-009789 BP near Austin?";
    expect(repairLookupPermitWithoutNumber(lookup, asked)).toBeUndefined();
    const inArea = { ...lookup, area: { ...lookup.area, query: "1982-009789 BP" } };
    expect(repairLookupPermitWithoutNumber(inArea, Q)).toBeUndefined();
    expect(
      repairLookupPermitWithoutNumber({ ...lookup, intent: "find_permits" }, Q),
    ).toBeUndefined();
  });

  it("without a place in the question it stays a lookup (and so asks, not guesses)", () => {
    expect(
      repairLookupPermitWithoutNumber(
        { ...lookup, area: { ...lookup.area, query: "" } },
        "the oldest stalled permit",
      ),
    ).toBeUndefined();
  });

  it("runAsk: the lookup plan the model gave is searched as a permit list, not a not_found lookup", async () => {
    const index = new FakeLeadIndex([property()], [permit({ statusClass: "stalled" })]);
    const { run } = ask(
      Q,
      [
        planText({
          intent: "lookup_permit",
          area: { kind: "place", query: "Austin", radiusMi: 5 },
        }),
        NOT_JSON,
      ],
      index,
    );
    const answer = await run;
    expect(answer.plan.intent).toBe("find_permits");
    expect(answer.plan.filters.statusClass).toEqual(["stalled"]);
    expect(answer.outcome).not.toBe("not_found");
    expect(index.searchPermitsCalls[0]).toMatchObject({ statusClass: ["stalled"] });
    expect(answer.trace.planRepairs?.join(" ")).toMatch(/find_permits/);
  });

  it("the plan prompt carries the oldest-stalled example and the lookup_permit rule", async () => {
    const { PLAN_SYSTEM_PROMPT } = await import("../../src/agent/composeAnswer.js");
    expect(PLAN_SYSTEM_PROMPT).toMatch(/oldest stalled roofing permit within 2 miles of Austin/);
    expect(PLAN_SYSTEM_PROMPT).toMatch(/lookup_permit ONLY when the rep typed a permit number/);
  });
});

describe("defect 4: a place named in a follow-up never inherits the thread's place", () => {
  const previousPlan: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Austin", radiusMi: 5 },
    filters: { roofAgeMinYears: 20 },
    slotSources: { roofAgeMinYears: "stated" },
    unsupported: [],
  };
  const Q = "Which properties within 5 miles of Houston have roofs older than 20 years?";

  it("applyInheritance: the plan's own place, marked inherited by mistake, is kept as stated", () => {
    const plan: QueryPlan = {
      ...previousPlan,
      area: { kind: "place", query: "Houston", radiusMi: 5 },
      slotSources: { area: "inherited", roofAgeMinYears: "stated" },
    };
    const out = applyInheritance(plan, previousPlan, Q);
    expect(out.area.query).toBe("Houston");
    expect(out.slotSources.area).toBe("stated");
  });

  it("applyInheritance: a blank area with an inherited mark still takes Houston from the question", () => {
    const plan: QueryPlan = {
      ...previousPlan,
      area: { kind: "place", query: "", radiusMi: 5 },
      slotSources: { area: "inherited" },
    };
    expect(applyInheritance(plan, previousPlan, Q).area.query).toBe("Houston");
  });

  it("applyInheritance: a real follow-up with no place still inherits", () => {
    const plan: QueryPlan = {
      ...previousPlan,
      area: { kind: "place", query: "", radiusMi: 5 },
      slotSources: { area: "inherited" },
    };
    const out = applyInheritance(plan, previousPlan, "Only the ones with a stalled permit");
    expect(out.area.query).toBe("Austin");
    expect(out.slotSources.area).toBe("inherited");
  });

  it("applyInheritance: restating the same place is still the inherited place", () => {
    const plan: QueryPlan = {
      ...previousPlan,
      area: { kind: "place", query: "Austin", radiusMi: 5 },
      slotSources: { area: "inherited" },
    };
    expect(applyInheritance(plan, previousPlan, "Same but near Austin").slotSources.area).toBe(
      "inherited",
    );
  });

  it.each([
    ["the model copies Houston but marks it inherited", "Houston"],
    ["the model leaves the area blank and marks it inherited", ""],
    ["the model copies the previous place and marks it inherited", "Austin"],
  ])("runAsk in a thread: %s -> refused, no property search", async (_label, query) => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      Q,
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query, radiusMi: 5 },
          filters: { roofAgeMinYears: 20 },
          slotSources: { area: "inherited", roofAgeMinYears: "stated" },
        }),
      ],
      index,
      { previousPlan },
    );
    const answer = await run;
    expect(["out_of_scope", "not_found", "needs_clarification"]).toContain(answer.outcome);
    expect(answer.plan.area.query).toBe("Houston");
    expect(answer.claims).toHaveLength(0);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("the follow-up plan prompt says a question naming a place is not an area follow-up", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run, model } = ask(Q, [roofPlan], index, { previousPlan });
    await run;
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toMatch(/names a place of its own/);
  });
});
