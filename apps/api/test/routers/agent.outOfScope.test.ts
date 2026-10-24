// T027 (B-09, Phase 4/US1): written and shown failing before apps/api/src/routers/agent.ts exists
// (TDD-first, constitution XXI). Per contracts/agent-api.md step 4: an out-of-scope area (ZIP
// 99999, not a Travis County ZCTA) short-circuits at the scope/place-resolution check — no tool
// calls, and critically no *compose* model call, so the model is never asked to narrate a dataset
// it was never shown. `outcome` must be `"out_of_scope"`, with zero `results`/`claims`.
import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import { router, createCallerFactory } from "../../src/trpc.js";
// Does not exist yet (T035) — this import is expected to fail module resolution, the correct
// TDD-first failure here, not a bad assertion in the test body below.
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
}

/** A single plan-step response is still expected (contracts/agent-api.md step 3 runs before the
 *  scope check in step 4) — it just must never be followed by a second, compose-step call. Any
 *  attempt by the implementation to call `doGenerate` a second time throws, so a stray compose
 *  call fails the test loudly instead of silently passing. */
function buildNoComposeModel(): MockLanguageModelV4 {
  let calls = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      calls += 1;
      if (calls > 1) {
        throw new Error("agent.ask made a compose-step model call for an out-of-scope ZIP");
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              intent: "find_properties",
              area: { kind: "zip", query: "99999", radiusMi: 5 },
              filters: {},
            }),
          },
        ],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 40, noCache: 40, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 15, text: 15, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

function ctx() {
  const leadIndex = new EmptyLeadIndex();
  const model = buildNoComposeModel();
  return {
    model,
    c: createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-agent-oos-1",
      userId: "rep-1",
      leadIndex,
      model,
    } as never),
  };
}

describe("agent.ask (T027) — out-of-scope ZIP 99999", () => {
  it("returns outcome out_of_scope with zero results/claims and no compose call", async () => {
    const { c, model } = ctx();

    const answer = await c.agent.ask({ question: "roofing leads in 99999", threadId: "thread-oos-1" });

    expect(answer.outcome).toBe("out_of_scope");
    expect(answer.claims).toEqual([]);
    // "results" isn't itself a field name on AgentAnswer (the full Zod shape has no `results[]` —
    // see packages/shared/src/agent/answer.ts); the closest equivalents the contract calls out as
    // "zero results" are `counts.matched`/`counts.shown` and `citations[]`, both required to be
    // empty/zero for an out-of-scope outcome.
    expect(answer.citations).toEqual([]);
    expect(answer.counts.matched).toBe(0);
    expect(answer.counts.shown).toBe(0);

    // The plan-step call is allowed; a second (compose) call is not — the mock model above throws
    // if `doGenerate` is invoked more than once, so reaching this line already proves it.
    expect(model.doGenerateCalls.length).toBeLessThanOrEqual(1);
  });
});
