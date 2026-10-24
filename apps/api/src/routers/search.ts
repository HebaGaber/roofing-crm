// T013 (B-03, US1): search.properties per contracts/search-api.md. Thin-router extraction
// (tasks.md T012, agent-design.md alakazam §1): the radius/roof-age/permit business logic now
// lives in ../services/search.ts, shared with the new agent tools (Phase 4) — this router only
// validates input, calls the service, and shapes the tRPC response (manifestCid/traceId, typed
// error mapping).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { HEX_OVERVIEW_MAX_ZOOM, MAX_RADIUS_MI, MIN_RADIUS_MI } from "@crm/domain";
import { mapIndexNotReady, publicProcedure, requireLeadIndex, router } from "../trpc.js";
import {
  countyOverview as countyOverviewService,
  CountyOverviewUnavailableError,
  searchPermits as searchPermitsService,
  searchProperties as searchPropertiesService,
} from "../services/search.js";

const CountyOverviewInput = z.object({
  zoom: z
    .number()
    .int()
    .min(0)
    .max(HEX_OVERVIEW_MAX_ZOOM - 1),
  roofAgeMinYears: z.number().int().min(0).max(200).optional(),
  propertyUsageType: z.string().min(1).max(64).optional(),
  permits: z.boolean().optional(),
  permitStatus: z.enum(["open", "stalled"]).optional(),
  permitOpenDaysMin: z.number().int().min(0).max(36_500).optional(),
});

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

  // design-review-log row 10: the whole-county hexagon aggregate for the map's zoomed-out view.
  // Behind the same Cognito JWT authorizer as every route but health.ping/auth.reportFailedAttempt
  // (infra/lib/crm-api-stack.ts). `zoom` is the whole-number map zoom, overview zooms only.
  countyOverview: publicProcedure.input(CountyOverviewInput).query(async ({ input, ctx }) => {
    const leadIndex = requireLeadIndex(ctx);
    try {
      const result = await countyOverviewService(leadIndex, input);
      return { ...result, traceId: ctx.requestId };
    } catch (error) {
      if (error instanceof CountyOverviewUnavailableError) {
        throw new TRPCError({ code: "NOT_IMPLEMENTED", message: error.message, cause: error });
      }
      mapIndexNotReady(error);
    }
  }),
});
