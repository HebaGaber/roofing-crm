// T028 (B-09, Phase 4/US1): written and shown failing before apps/api/src/routers/agent.ts exists
// (TDD-first, constitution XXI). Per contracts/agent-api.md's `agent.confirmLead`: this is a
// plain, non-model-invoked tRPC mutation the UI calls after the rep taps "Create" on the
// confirmation card. It must call `requireLeadService(ctx).create(...)` — the exact same
// application-layer call `leads.create` already uses (apps/api/src/routers/leads.ts) — with
// `createdFrom: "agent"` and `sourceManifestCid` set to the pinned Run-1 CID
// (`bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu`, the same constant
// leadIndex.manifestCid.test.ts pins). This test also ties to T029: the confirm-flow-bypass guard
// says that same `LeadService.create` call must never be reachable from
// `apps/api/src/services/agent/tools.ts` — only from this router handler.
import { describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import type { CreateLeadInput } from "../../src/services/leads.js";
import type { LeadService } from "../../src/services/leads.js";
import { router, createCallerFactory } from "../../src/trpc.js";
// Does not exist yet (T036) — this import is expected to fail module resolution, the correct
// TDD-first failure here, not a bad assertion in the test body below.
import { agentRouter } from "../../src/routers/agent.js";

const RUN_1_MANIFEST_CID = "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu";
const TCAD_ID = "0208011301";
const PROPERTY_CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function property(): Provenanced<CrmProperty> {
  return {
    propertyCid: PROPERTY_CID,
    requestIdentifier: TCAD_ID,
    latitude: 30.4118,
    longitude: -97.7069,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 28,
    roofAgeBasis: "built_year",
    roofAgeConfidence: "medium",
    isLongTenure: null,
    ownerKind: null,
    ownerAreaClass: null,
    ownerIsOutOfArea: null,
    sourceManifestCid: RUN_1_MANIFEST_CID,
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: PROPERTY_CID,
    runId: "travis-202609-permits-20261021t103516z",
  };
}

class FakeLeadIndex implements LeadIndex {
  constructor(private readonly rows: Provenanced<CrmProperty>[]) {}
  async indexInfo() {
    return {
      manifestCid: RUN_1_MANIFEST_CID,
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
  async presentRequestIdentifiers(ids: readonly string[]) {
    return new Set(ids.filter((id) => this.rows.some((r) => r.requestIdentifier === id)));
  }
  async currentRunId() {
    return "travis-202609-permits-20261021t103516z";
  }
  async getProperty(propertyCid: string) {
    const found = this.rows.find((r) => r.propertyCid === propertyCid);
    return found === undefined ? null : { ...found, permits: [] };
  }
}

/** A spy standing in for the real `LeadService` (the same DI seam `leads.ts`'s router already
 *  uses via `requireLeadService(ctx)` — never imported/instantiated by `agent.ts` itself). Only
 *  `create` is asserted on; the rest exist solely to satisfy the `LeadService` interface. */
function fakeLeadService(): LeadService & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async (input: CreateLeadInput, by: string) => ({
    ...input,
    leadKey: `${input.fips}:tcad:${input.requestIdentifier}`,
    status: "new" as const,
    assignee: by,
    eventSequence: 0,
  }));
  return {
    create,
    updateStatus: vi.fn(),
    addNote: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
  } as unknown as LeadService & { create: ReturnType<typeof vi.fn> };
}

function ctx() {
  const leadIndex = new FakeLeadIndex([property()]);
  const leadService = fakeLeadService();
  return {
    leadService,
    c: createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-agent-confirm-1",
      userId: "rep-1",
      leadIndex,
      leadService,
    } as never),
  };
}

describe("agent.confirmLead (T028)", () => {
  it("calls requireLeadService(ctx).create with createdFrom:'agent' and the pinned manifest CID", async () => {
    const { c, leadService } = ctx();

    await c.agent.confirmLead({ threadId: "thread-1", tcadId: TCAD_ID });

    expect(leadService.create).toHaveBeenCalledTimes(1);
    const [input, by] = leadService.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input).toMatchObject({
      createdFrom: "agent",
      sourceManifestCid: RUN_1_MANIFEST_CID,
    });
    expect(by).toBe("rep-1");
  });
});
