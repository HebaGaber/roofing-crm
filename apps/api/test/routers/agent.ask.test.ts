// T026 (B-09, Phase 4/US1): written and shown failing before apps/api/src/routers/agent.ts (and
// apps/api/src/agent/getModel.ts, apps/api/src/agent/runAgent.ts) exist (TDD-first, constitution
// XXI). Exercises the full `agent.ask` tool loop — plan -> resolvePlace -> searchProperties ->
// compose -> verify — against a `MockLanguageModelV4` (not `MockLanguageModelV2`: that class does
// not exist in the installed `ai@7.0.152`'s `ai/test` subpackage, which only ships
// `MockLanguageModelV3`/`MockLanguageModelV4`; `V4` is the spec version `@ai-sdk/amazon-bedrock`
// 5.0.123 (getModel.ts's Bedrock path, per agent-design.md ash §1) actually implements, so this is
// the correct mock for the model `runAgent.ts` will receive, not a deviation from the task's
// intent).
//
// Per contracts/agent-api.md's `agent.ask` steps 3/5/6/7: a plan-step model call, two tool calls
// (`resolvePlace`, `searchProperties`) executed by the AI SDK's own tool loop
// (`generateText({model, tools, maxSteps: 3, ...})`, agent-design.md ash §1 — "the SDK's own
// tool-loop, not hand-rolled"), then a compose-step model call whose output plants a fake
// `property_cid` citation that is NOT present in any tool result this turn. The server-side
// citation verifier (services/agent/verifyCitations.ts, T031 — also not built yet) must strip it
// before the answer leaves the server, so the returned `AgentAnswer.claims` must never carry a
// `citationIds` entry pointing at that fake citation. `trace.modelCalls` must stay within the
// ADR-06 budget of <=3 model calls (plan + 2 tool-loop steps, no repair needed here).
import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import { router, createCallerFactory } from "../../src/trpc.js";
// Does not exist yet (T035) — this import is expected to fail module resolution, which is the
// correct TDD-first failure (constitution XXI), not a bad assertion in the test body below.
import { agentRouter } from "../../src/routers/agent.js";

const PFLUGERVILLE = { lat: 30.4394, lng: -97.62 };

const REAL_PROPERTY_CID =
  "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
// Planted in the mocked compose output only — never returned by any tool call this turn, so the
// server-side citation verifier must strip any claim that cites it (the test's core assertion).
const FAKE_PLANTED_PROPERTY_CID =
  "bafkreiFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFA";

function property(overrides: Partial<Provenanced<CrmProperty>> = {}): Provenanced<CrmProperty> {
  return {
    propertyCid: REAL_PROPERTY_CID,
    requestIdentifier: "R-0001",
    latitude: 30.4118,
    longitude: -97.7069,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 32,
    roofAgeBasis: "built_year",
    roofAgeConfidence: "medium",
    isLongTenure: null,
    ownerKind: null,
    ownerAreaClass: null,
    ownerIsOutOfArea: null,
    sourceManifestCid: "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu",
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: REAL_PROPERTY_CID,
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

/** Same shape as search.properties.test.ts's `FakeLeadIndex` (B-03 convention) — never reaches
 *  real DuckDB/S3; the agent's `searchProperties` tool (T032) calls this same `LeadIndex` port. */
class FakeLeadIndex implements LeadIndex {
  constructor(private readonly rows: Provenanced<CrmProperty>[]) {}
  async indexInfo() {
    return {
      manifestCid: "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu",
      propertyCount: this.rows.length,
      permitCount: 0,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  async searchProperties(_query: SearchPropertiesQuery) {
    return this.rows;
  }
  async searchPermits(_query: SearchPermitsQuery): Promise<Provenanced<CrmPermit>[]> {
    return [];
  }
  async presentRequestIdentifiers() {
    return new Set<string>();
  }
  async currentRunId() {
    return "travis-202609-permits-20261021t103516z";
  }
  async getProperty(propertyCid: string) {
    const found = this.rows.find((r) => r.propertyCid === propertyCid);
    return found === undefined ? null : { ...found, permits: [] };
  }
}

/** Three steps: a plan-shaped tool call, a resolvePlace tool call, a searchProperties tool call,
 *  then a final compose step whose text plants a fake `property_cid` citation. The AI SDK's own
 *  tool loop (`maxSteps: 3`) drives these three `doGenerate` calls, matching the <=3-model-calls
 *  NFR exactly. */
function buildMockModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "resolvePlace",
            input: JSON.stringify({ text: "Pflugerville" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      },
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "call-2",
            toolName: "searchProperties",
            input: JSON.stringify({
              area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
              filters: {},
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage: { inputTokens: 80, outputTokens: 25, totalTokens: 105 },
      },
      {
        // Compose step: cites one real, server-returned property plus one fake, planted CID that
        // never appeared in any tool result this turn.
        content: [
          {
            type: "text",
            text: JSON.stringify({
              claims: [
                { text: `Found a roofing opportunity near ${PFLUGERVILLE.lat}.`, citationIds: [1] },
                {
                  text: "A fabricated extra property the model invented.",
                  citationIds: [2],
                },
              ],
              citations: [
                { id: 1, propertyCid: REAL_PROPERTY_CID },
                { id: 2, propertyCid: FAKE_PLANTED_PROPERTY_CID },
              ],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: { inputTokens: 120, outputTokens: 60, totalTokens: 180 },
      },
    ],
  });
}

function ctx() {
  const leadIndex = new FakeLeadIndex([property()]);
  const model = buildMockModel();
  return {
    leadIndex,
    model,
    // `agent.ts`'s context additionally needs the model and the usage-guard deps once it exists;
    // the exact shape is this story's implementation detail (T033-T035), not fixed by this test.
    c: createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-agent-1",
      userId: "rep-1",
      leadIndex,
      model,
    } as never),
  };
}

describe("agent.ask (T026) — full tool loop against a mocked model", () => {
  it("stays within the <=3 model-calls budget and never lets a planted fake citation reach claims", async () => {
    const { c, model } = ctx();

    const answer = await c.agent.ask({ question: "roofing opportunities near Pflugerville", threadId: "thread-1" });

    expect(answer.trace.modelCalls).toBeLessThanOrEqual(3);
    expect(model.doGenerateCalls.length).toBeLessThanOrEqual(3);

    // Core assertion: the fake, planted `property_cid` must never surface in the returned
    // claims/citations, however the server-side verifier (T031) implements the strip.
    const citedPropertyCids = answer.citations
      .map((citation) => citation.propertyCid)
      .filter((cid): cid is string => cid !== undefined);
    expect(citedPropertyCids).not.toContain(FAKE_PLANTED_PROPERTY_CID);

    const fakeCitationIds = answer.citations
      .filter((citation) => citation.propertyCid === FAKE_PLANTED_PROPERTY_CID)
      .map((citation) => citation.id);
    for (const claim of answer.claims) {
      for (const citationId of claim.citationIds) {
        expect(fakeCitationIds).not.toContain(citationId);
      }
    }
  });
});
