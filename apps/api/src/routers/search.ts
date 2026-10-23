// T013 (B-03, US1): search.properties per contracts/search-api.md. The radius math (bboxFor,
// implicitly via the adapter) and the exact-circle cut live in the extended
// `DuckDbParquetLeadIndex.searchProperties` (T012) — this router only validates input, calls the
// port twice (with and without roofAgeMinYears, so `counts` is always fresh over the full
// matching set, never a cached subset — FR-004/AC-4) and shapes the response.
import { z } from "zod";
import { isLongOpen } from "@crm/domain";
import { publicProcedure, requireLeadIndex, router } from "../trpc.js";

const LatLngInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const SearchPropertiesInput = z.object({
  center: LatLngInput,
  // FR-001/data-model.md: inclusive 0.5-25 mi, a Zod error outside it — never silently clamped.
  radiusMi: z.number().min(0.5).max(25),
  roofAgeMinYears: z.number().int().optional(),
  // architecture-constitution.md §6's page-limit bound.
  limit: z.number().int().positive().max(100).optional(),
});

export const searchRouter = router({
  properties: publicProcedure.input(SearchPropertiesInput).query(async ({ input, ctx }) => {
    const leadIndex = requireLeadIndex(ctx);
    const { manifestCid } = await leadIndex.indexInfo();

    // Both counts run over the full radius-matching set, with no SQL LIMIT applied (the adapter
    // only applies `limit` to the final exact-circle-cut result) — contracts/search-api.md step 4.
    const afterRadius = await leadIndex.searchProperties({
      center: input.center,
      radiusMi: input.radiusMi,
    });
    const afterRoofAge =
      input.roofAgeMinYears === undefined
        ? afterRadius
        : await leadIndex.searchProperties({
            center: input.center,
            radiusMi: input.radiusMi,
            roofAgeMinYears: input.roofAgeMinYears,
          });

    const properties = afterRoofAge.slice(0, input.limit ?? 100);

    return {
      properties,
      counts: {
        afterRadius: afterRadius.length,
        afterRoofAge: afterRoofAge.length,
      },
      manifestCid,
      traceId: ctx.requestId,
    };
  }),

  // T028 (B-03, US3): search.permits per contracts/search-api.md. Joins through the same
  // radius-filtered property set `properties` above computes (via one extra searchProperties
  // call, not a separately-derived radius — SC-06), then attaches isLongOpen (packages/domain) as
  // a display-layer flag, never stored or re-derived from issueDate (data-model.md).
  permits: publicProcedure
    .input(
      z.object({
        center: LatLngInput,
        radiusMi: z.number().min(0.5).max(25),
        sort: z.literal("openDays"),
      }),
    )
    .query(async ({ input, ctx }) => {
      const leadIndex = requireLeadIndex(ctx);
      const { manifestCid } = await leadIndex.indexInfo();

      const inRadius = await leadIndex.searchProperties({
        center: input.center,
        radiusMi: input.radiusMi,
      });
      const propertyCids = inRadius.map((p) => p.propertyCid);

      const permits = await leadIndex.searchPermits({ propertyCids, sort: "openDays" });

      return {
        permits: permits.map((permit) => ({ ...permit, isLongOpen: isLongOpen(permit.openDays) })),
        manifestCid,
        traceId: ctx.requestId,
      };
    }),
});
