// T013 (B-03, US1): search.properties per contracts/search-api.md. Thin-router extraction
// (tasks.md T012, agent-design.md alakazam §1): the radius/roof-age/permit business logic now
// lives in ../services/search.ts, shared with the new agent tools (Phase 4) — this router only
// validates input, calls the service, and shapes the tRPC response (manifestCid/traceId, typed
// error mapping).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MAX_RADIUS_MI, MIN_RADIUS_MI } from "@crm/domain";
import { publicProcedure, requireLeadIndex, router } from "../trpc.js";
import { IndexNotReadyError } from "../adapters/duckDbParquet.js";
import {
  searchPermits as searchPermitsService,
  searchProperties as searchPropertiesService,
} from "../services/search.js";

/** Same mapping as routers/property.ts: a typed, honest "index not ready" response (never a bare
 *  500) when no run has ever been promoted — found live (B-03): crm-leads is B-07's table
 *  (architecture-constitution.md §9) and doesn't exist in this environment yet, so every search
 *  currently hits this path, not just a rare edge case. */
function mapIndexNotReady(error: unknown): never {
  if (error instanceof IndexNotReadyError) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error.message, cause: error });
  }
  throw error;
}

const LatLngInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const SearchPropertiesInput = z.object({
  center: LatLngInput,
  // FR-001/data-model.md: inclusive 0.5-25 mi, a Zod error outside it — never silently clamped.
  radiusMi: z.number().min(MIN_RADIUS_MI).max(MAX_RADIUS_MI),
  roofAgeMinYears: z.number().int().optional(),
  // architecture-constitution.md §6's page-limit bound.
  limit: z.number().int().positive().max(100).optional(),
});

export const searchRouter = router({
  properties: publicProcedure.input(SearchPropertiesInput).query(async ({ input, ctx }) => {
    const leadIndex = requireLeadIndex(ctx);
    try {
      const result = await searchPropertiesService(leadIndex, input);
      return { ...result, traceId: ctx.requestId };
    } catch (error) {
      mapIndexNotReady(error);
    }
  }),

  // T028 (B-03, US3): search.permits per contracts/search-api.md. sort is fixed to "openDays".
  permits: publicProcedure
    .input(
      z.object({
        center: LatLngInput,
        radiusMi: z.number().min(MIN_RADIUS_MI).max(MAX_RADIUS_MI),
        sort: z.literal("openDays"),
      }),
    )
    .query(async ({ input, ctx }) => {
      const leadIndex = requireLeadIndex(ctx);
      try {
        const result = await searchPermitsService(leadIndex, input);
        return { ...result, traceId: ctx.requestId };
      } catch (error) {
        mapIndexNotReady(error);
      }
    }),
});
