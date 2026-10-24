// T032 (B-09, Phase 4/US1): the agent's fixed, read-only tool set (ADR-06 §6.2,
// docs/decisions/0000-agent-architecture.md; contracts/agent-api.md's tool table). Every tool is
// a thin Zod-typed wrapper around services already built: `services/search.ts`,
// `services/propertyDetail.ts` (Phase 2) and `services/agent/placeResolver.ts` (this phase) — no
// new query logic lives here.
//
// CRITICAL (constitution P0, FR-002/AC-2, contracts/agent-api.md's `agent.confirmLead`):
// `proposeLeads` reads only — a `getProperty`-shaped lookup plus a duplicate check straight
// against the `LeadRepo` port (crm-leads) — and writes nothing. This file must NEVER import the
// application-layer lead-write service or its context accessor (see T029's import guard test,
// `apps/api/test/services/agent/toolsImportGuard.test.ts`, which greps this file's own source for
// those two identifiers by name); only `apps/api/src/routers/agent.ts`'s separate, rep-triggered
// `confirmLead` mutation is allowed to reach that call.
import { tool } from "ai";
import { z } from "zod";
import { leadKey } from "@crm/domain";
import { gazetteer } from "@crm/oracle-views";
import type { PlaceResolver } from "@crm/shared";
import type { LeadIndex, PermitResult, PropertyResult } from "../../adapters/duckDbParquet.js";
import type { LeadRepo } from "../../adapters/leadRepo.js";
import { searchPermits, searchProperties } from "../search.js";
import { propertyDetail } from "../propertyDetail.js";

/** Mirrors `services/leads.ts`'s own `matchingRequestIdentifiers` scan — the LeadIndex port has
 *  no single "get by requestIdentifier" lookup, only by `propertyCid` (adapters/duckDbParquet.ts),
 *  so a `tcadId`-keyed tool input resolves to a `propertyCid` the same way that service already
 *  does: one bounded, unfiltered scan, then an in-memory match. */
const INDEX_SCAN_LIMIT = 1_000_000;

async function propertyCidForTcadId(
  leadIndex: LeadIndex,
  tcadId: string,
): Promise<string | undefined> {
  const rows = await leadIndex.searchProperties({ limit: INDEX_SCAN_LIMIT });
  return rows.find((row) => row.requestIdentifier === tcadId)?.propertyCid;
}

const AreaInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  // ADR-06 §4's inclusive 0.5-25mi bound, the same one QueryPlan.area.radiusMi enforces.
  radiusMi: z.number().min(0.5).max(25),
});

/** Caps how many full rows ever go to the model in one tool result (ADR §6.2: "≤25 compact
 *  rows") — the UI pages the full set from `resultSetId`/the index itself, never from here. */
const MAX_COMPACT_ROWS = 25;

export interface AgentToolsDeps {
  readonly leadIndex: LeadIndex;
  readonly leadRepo: LeadRepo;
  readonly placeResolver: PlaceResolver;
}

export function createAgentTools(deps: AgentToolsDeps) {
  const { leadIndex, leadRepo, placeResolver } = deps;

  const resolvePlace = tool({
    description:
      "Resolve a place name, ZIP code, or address-like text to a point in Travis County, with a confidence score and up to 3 candidates. Does not write anything.",
    inputSchema: z.object({ text: z.string().min(1).max(80) }),
    execute: async ({ text }) => {
      const resolution = await placeResolver.resolve(text);
      return {
        status: resolution.status,
        source: resolution.source,
        candidates: resolution.candidates.map((c) => ({
          name: c.name,
          lat: c.lat,
          lon: c.lon,
          match: c.match,
          score: c.score,
        })),
      };
    },
  });

  const searchPropertiesTool = tool({
    description:
      "Find properties within a radius of a point, optionally filtered by a minimum roof age, " +
      "the owner's area classification (e.g. regional/out_of_area for \"owners outside the " +
      "area\"), and/or a minimum owner-tenure threshold in years (honored only at the stored " +
      ">10-year cutoff). Returns server-computed counts plus up to 25 compact rows. Does not " +
      "write anything.",
    inputSchema: AreaInput.extend({
      roofAgeMinYears: z.number().int().min(0).max(100).optional(),
      // T043 (B-09/US2, G4 "owners outside the area"): exact match against the stored
      // ownerAreaClass enum — the model passes the exact class(es) it means, never a free-text
      // guess at what "outside the area" covers.
      ownerAreaClass: z
        .array(z.enum(["in_county", "regional", "out_of_area", "unknown"]))
        .min(1)
        .optional(),
      // T043 (B-09/US2, G4 "10+ years"): see SearchPropertiesQuery.tenureYearsMin's doc comment
      // in adapters/duckDbParquet.ts — honored only at the one fixed (>10yr) cutoff this index
      // actually stores.
      tenureYearsMin: z.number().int().min(0).max(100).optional(),
    }),
    execute: async ({ lat, lon, radiusMi, roofAgeMinYears, ownerAreaClass, tenureYearsMin }) => {
      const result = await searchProperties(leadIndex, {
        center: { lat, lng: lon },
        radiusMi,
        roofAgeMinYears,
        ownerAreaClass,
        tenureYearsMin,
        limit: MAX_COMPACT_ROWS,
      });
      return {
        manifestCid: result.manifestCid,
        counts: result.counts,
        properties: result.properties.slice(0, MAX_COMPACT_ROWS),
      };
    },
  });

  const searchPermitsTool = tool({
    description:
      "Find permits within a radius of a point, optionally filtered by status class, a minimum " +
      "open-years threshold, and/or an exact permit number lookup, sorted by open days " +
      "descending. Returns up to 25 compact rows. Does not write anything.",
    inputSchema: AreaInput.extend({
      statusClass: z.array(z.enum(["open", "stalled", "closed"])).optional(),
      openYearsMin: z.number().min(0).max(50).optional(),
      // T044 (B-09/US2, G5 "exact permit lookup"): an exact permitNumber lookup, scoped to the
      // same radius as every other filter here (SC-06) — never a second, unscoped lookup path.
      permitNumber: z.string().min(1).optional(),
    }),
    execute: async ({ lat, lon, radiusMi, statusClass, openYearsMin, permitNumber }) => {
      const result = await searchPermits(leadIndex, {
        center: { lat, lng: lon },
        radiusMi,
        permitNumber,
      });
      let permits: (PermitResult & { isLongOpen: boolean })[] = result.permits;
      if (statusClass !== undefined) {
        const allowed = new Set<string>(statusClass);
        permits = permits.filter(
          (p) => p.statusClass !== null && allowed.has(p.statusClass),
        );
      }
      if (openYearsMin !== undefined) {
        const minDays = openYearsMin * 365;
        permits = permits.filter((p) => (p.openDays ?? -1) >= minDays);
      }
      return {
        manifestCid: result.manifestCid,
        permits: permits.slice(0, MAX_COMPACT_ROWS),
      };
    },
  });

  const getPropertyTool = tool({
    description:
      "Look up one property by its TCAD request identifier (tcadId) or its propertyCid, with its permits. Does not write anything.",
    inputSchema: z
      .object({
        tcadId: z.string().min(1).optional(),
        propertyCid: z.string().min(1).optional(),
      })
      .refine((v) => v.tcadId !== undefined || v.propertyCid !== undefined, {
        message: "tcadId or propertyCid is required",
      }),
    execute: async ({ tcadId, propertyCid }) => {
      const cid =
        propertyCid ?? (tcadId !== undefined ? await propertyCidForTcadId(leadIndex, tcadId) : undefined);
      if (cid === undefined) return { found: false as const };

      const detail = await propertyDetail(leadIndex, cid);
      if (detail.property === null) return { found: false as const };
      return {
        found: true as const,
        manifestCid: detail.manifestCid,
        property: detail.property,
        permits: detail.permits,
        bbbStatus: detail.bbbStatus,
        bbbStatusReason: detail.bbbStatusReason,
      };
    },
  });

  const getCoverageTool = tool({
    description:
      "Get the current index's run metadata: the manifest CID, counts, and promotion time. Does not write anything.",
    inputSchema: z.object({}),
    execute: async () => leadIndex.indexInfo(),
  });

  const proposeLeadsTool = tool({
    description:
      "Check which of these TCAD properties already have a lead in the CRM. Returns proposals only — it never creates, modifies, or deletes a lead. Creating a lead always requires a separate, explicit rep action (agent.confirmLead).",
    inputSchema: z.object({ tcadIds: z.array(z.string().min(1)).min(1).max(25) }),
    execute: async ({ tcadIds }) => {
      const proposals = await Promise.all(
        tcadIds.map(async (tcadId) => {
          const key = leadKey(gazetteer.TRAVIS_FIPS, tcadId);
          const existing = await leadRepo.get(key); // read-only duplicate check; never writes
          return {
            tcadId,
            alreadyLead: existing !== null,
            leadId: existing?.lead.leadId,
          };
        }),
      );
      return { proposals };
    },
  });

  return {
    resolvePlace,
    searchProperties: searchPropertiesTool,
    searchPermits: searchPermitsTool,
    getProperty: getPropertyTool,
    getCoverage: getCoverageTool,
    proposeLeads: proposeLeadsTool,
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;

// Referenced only for its type above (PropertyResult/searchProperties' return shape) — kept as an
// explicit import rather than an inline `Awaited<...>` so this file documents, in its own import
// list, exactly which service-layer shapes it depends on.
export type { PropertyResult };
