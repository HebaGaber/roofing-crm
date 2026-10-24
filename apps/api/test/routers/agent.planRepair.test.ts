// New in the 009-agent-hardening architecture fix (docs/decisions/0000-agent-architecture.md
// §4/§6.1: "one repair call... then re-validate"). Proves the plan step's one-repair-retry path:
// a first plan-call response that fails `QueryPlan` Zod validation (not JSON at all, here —
// exercising the same `tryParsePlan` failure branch a JSON-but-wrong-shape response would also
// hit), followed by a second (repair) response that succeeds. Asserts exactly 2 model calls
// happened for the plan step (`doGenerate` called twice, no compose call reached since the
// in-scope property search below has no matches and the resulting outcome is `empty_in_scope`,
// which still only costs 2 model calls: the fixed-area dispatch path returns zero rows, but the
// compose call still runs per the ADR's step 6 — so this fixture instead asserts the plan is the
// one successfully repaired, by checking `answer.plan` reflects the repaired plan's area, not
// the first (failed) attempt).
import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import { router, createCallerFactory } from "../../src/trpc.js";
import { agentRouter } from "../../src/routers/agent.js";

class EmptyLeadIndex implements LeadIndex {
  async indexInfo() {
    return {
      manifestCid: "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu",
      propertyCount: 0,
      permitCount: 0,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  async searchProperties(_query: SearchPropertiesQuery): Promise<Provenanced<CrmProperty>[]> {
    return [];
  }
  async searchPermits(_query: SearchPermitsQuery): Promise<Provenanced<CrmPermit>[]> {
    return [];
  }
  async presentRequestIdentifiers() {
    return new Set<string>();
  }
  async currentRunId() {
    return undefined;
  }
  async getProperty() {
    return null;
  }
  async getPropertyByRequestIdentifier() {
    return undefined;
  }
}

const VALID_REPAIR_RESPONSE = {
  intent: "find_properties" as const,
  area: { kind: "place" as const, query: "Pflugerville", radiusMi: 5 },
  filters: {},
  slotSources: {},
  unsupported: [],
};

/** First response is plain prose (not even JSON) — fails `tryParsePlan`'s `JSON.parse` step.
 *  Second response is a valid `QueryPlan`. Third response (the compose call, since the repaired
 *  plan is in-scope and dispatch runs) returns an empty claims/citations compose output — the
 *  test only cares about the plan step's call count and the repaired plan surfacing in the
 *  answer, not the compose content. */
function buildRepairModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [{ type: "text", text: "Sorry, I don't understand the question." }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 30, noCache: 30, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      },
      {
        content: [{ type: "text", text: JSON.stringify(VALID_REPAIR_RESPONSE) }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 60, noCache: 60, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      },
      {
        content: [{ type: "text", text: JSON.stringify({ claims: [], citations: [] }) }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 60, noCache: 60, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      },
    ],
  });
}

function ctx() {
  const leadIndex = new EmptyLeadIndex();
  const model = buildRepairModel();
  return {
    model,
    c: createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-agent-repair-1",
      userId: "rep-1",
      leadIndex,
      model,
    }),
  };
}

describe("agent.ask — plan repair-retry path", () => {
  it("makes exactly 2 model calls for the plan step and uses the repaired plan", async () => {
    const { c, model } = ctx();

    const answer = await c.agent.ask({
      question: "roofing opportunities near Pflugerville",
      threadId: "thread-repair-1",
    });

    // Plan (invalid) + repair (valid) + compose = 3 total, at the ADR's <=3 ceiling.
    expect(model.doGenerateCalls.length).toBe(3);
    expect(answer.trace.modelCalls).toBe(3);

    // The repaired plan — not a fallback/empty plan — is the one that surfaces in the answer.
    expect(answer.plan.area.query).toBe("Pflugerville");
    expect(answer.plan.intent).toBe("find_properties");
  });

  it("returns needs_clarification with exactly 2 model calls when the repair also fails", async () => {
    const leadIndex = new EmptyLeadIndex();
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [{ type: "text", text: "not json at all" }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage: {
            inputTokens: { total: 30, noCache: 30, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          warnings: [],
        },
        {
          content: [{ type: "text", text: "still not json" }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage: {
            inputTokens: { total: 30, noCache: 30, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          warnings: [],
        },
      ],
    });
    const c = createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-agent-repair-2",
      userId: "rep-1",
      leadIndex,
      model,
    });

    const answer = await c.agent.ask({
      question: "garble garble",
      threadId: "thread-repair-2",
    });

    expect(answer.outcome).toBe("needs_clarification");
    expect(model.doGenerateCalls.length).toBe(2);
    expect(answer.trace.modelCalls).toBe(2);
    expect(answer.claims).toEqual([]);
  });
});
