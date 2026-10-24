// Thin-router extraction (tasks.md T012; agent-design.md alakazam §1: "Move the router bodies
// into services first, so the routers and the tools share one code path"). The business logic
// previously inline in routers/search.ts, unchanged: the two-call/`counts` pattern (counts are
// always computed over the full matching set, never a cached subset — FR-004/AC-4) and the
// radius-join for permits (SC-06). Routers/search.ts now only validates input and shapes the
// tRPC response (manifestCid/traceId, error mapping); the new agent tools (Phase 4,
// services/agent/tools.ts) call these same functions instead of a second copy.
import { isLongOpen } from "@crm/domain";
import type {
  CountyOverview,
  CountyOverviewQuery,
  LeadIndex,
  PermitResult,
  PropertyResult,
} from "../adapters/duckDbParquet.js";

export interface SearchCenter {
  lat: number;
  lng: number;
}

export interface SearchPropertiesInput {
  center: SearchCenter;
  radiusMi: number;
  // `| undefined` (not just `?`) because `exactOptionalPropertyTypes` treats the router's
  // Zod-inferred `{ roofAgeMinYears?: number }` (an explicit-undefined-bearing shape once spread
  // through `{ ...input }`) as distinct from a plain optional property.
  roofAgeMinYears?: number | undefined;
  /** T043 (B-09/US2, G4): "owners outside the area." Passed straight through to the adapter's
   *  exact-match `ownerAreaClass` filter — never a second, independently-derived classification. */
  ownerAreaClass?: string | readonly string[] | undefined;
  /** T043 (B-09/US2, G4): see `SearchPropertiesQuery.tenureYearsMin`'s doc comment in
   *  `adapters/duckDbParquet.ts` for the fixed-cutoff limitation this threshold is honored at. */
  tenureYearsMin?: number | undefined;
  limit?: number | undefined;
}

export interface SearchPropertiesResult {
  properties: PropertyResult[];
  /** `excludedNoRoofDate` (B-09 review, CR finding 10): rows in the radius that a roof-age
   *  filter excluded only because they carry no roof date (`roofAgeYears` null) — 0 when no
   *  roof-age filter was applied. */
  counts: { afterRadius: number; afterRoofAge: number; excludedNoRoofDate: number };
  manifestCid: string;
}

/** contracts/search-api.md step 4: both counts run over the full radius-matching set, with no
 *  SQL LIMIT applied (`limit` is applied only to the final exact-circle-cut result). */
export async function searchProperties(
  leadIndex: LeadIndex,
  input: SearchPropertiesInput,
): Promise<SearchPropertiesResult> {
  const { manifestCid } = await leadIndex.indexInfo();

  const afterRadius = await leadIndex.searchProperties({
    center: input.center,
    radiusMi: input.radiusMi,
  });
  // T043 (B-09/US2): ownerAreaClass/tenureYearsMin are additional filters over the same
  // radius-matching set, applied together with roofAgeMinYears in one query — never a
  // separately-derived radius (SC-06's same rule, extended to these two new filters).
  const hasFilter =
    input.roofAgeMinYears !== undefined ||
    input.ownerAreaClass !== undefined ||
    input.tenureYearsMin !== undefined;
  const afterRoofAge = !hasFilter
    ? afterRadius
    : await leadIndex.searchProperties({
        center: input.center,
        radiusMi: input.radiusMi,
        // Conditional spreads, not literal `field: input.field` — exactOptionalPropertyTypes
        // forbids assigning an explicit `| undefined` to SearchPropertiesQuery's plain-optional
        // fields, so an unset filter must be omitted entirely, not passed as undefined.
        ...(input.roofAgeMinYears === undefined ? {} : { roofAgeMinYears: input.roofAgeMinYears }),
        ...(input.ownerAreaClass === undefined ? {} : { ownerAreaClass: input.ownerAreaClass }),
        ...(input.tenureYearsMin === undefined ? {} : { tenureYearsMin: input.tenureYearsMin }),
      });

  const properties = afterRoofAge.slice(0, input.limit ?? 100);

  return {
    properties,
    counts: {
      afterRadius: afterRadius.length,
      afterRoofAge: afterRoofAge.length,
      excludedNoRoofDate:
        input.roofAgeMinYears === undefined
          ? 0
          : afterRadius.filter((p) => p.roofAgeYears === null).length,
    },
    manifestCid,
  };
}

export interface SearchPermitsInput {
  center: SearchCenter;
  radiusMi: number;
  /** T044 (B-09/US2, G5): exact permit-number lookup, scoped to the same radius-filtered
   *  property set as every other permit query here (SC-06) — never a second, unscoped lookup
   *  path. */
  permitNumber?: string | undefined;
}

export interface SearchPermitsResult {
  permits: (PermitResult & { isLongOpen: boolean })[];
  manifestCid: string;
}

/** contracts/search-api.md step 2: joins through the same radius-filtered property set
 *  `searchProperties` above computes (via one extra `searchProperties` call, not a
 *  separately-derived radius — SC-06), then attaches `isLongOpen` (packages/domain) as a
 *  display-layer flag, never stored or re-derived from `issueDate` (data-model.md). */
export async function searchPermits(
  leadIndex: LeadIndex,
  input: SearchPermitsInput,
): Promise<SearchPermitsResult> {
  const { manifestCid } = await leadIndex.indexInfo();

  const inRadius = await leadIndex.searchProperties({
    center: input.center,
    radiusMi: input.radiusMi,
  });
  const propertyCids = inRadius.map((p) => p.propertyCid);

  const permits = await leadIndex.searchPermits({
    propertyCids,
    // See searchProperties above: exactOptionalPropertyTypes forbids an explicit `undefined`.
    ...(input.permitNumber === undefined ? {} : { permitNumber: input.permitNumber }),
    sort: "openDays",
  });

  return {
    permits: permits.map((permit) => ({
      ...permit,
      isLongOpen: isLongOpen(permit.openDays),
    })),
    manifestCid,
  };
}

/** Thrown when the wired `LeadIndex` has no `countyOverview` (only a test double can lack it). */
export class CountyOverviewUnavailableError extends Error {
  readonly code = "COUNTY_OVERVIEW_UNAVAILABLE" as const;
  constructor() {
    super("LeadIndex: this index does not serve the county overview");
  }
}

export interface CountyOverviewInput {
  zoom: number;
  // `| undefined` for the same exactOptionalPropertyTypes reason as SearchPropertiesInput.
  roofAgeMinYears?: number | undefined;
  propertyUsageType?: string | undefined;
  permits?: boolean | undefined;
  permitStatus?: "open" | "stalled" | undefined;
  permitOpenDaysMin?: number | undefined;
}

/** search.countyOverview (design-review-log row 10): the whole-county hexagon aggregate for the
 *  map's zoomed-out view. The aggregation and its sandbox cache live in the adapter; this only
 *  drops unset filters (so the cache key and the SQL never see an explicit `undefined`). */
export async function countyOverview(
  leadIndex: LeadIndex,
  input: CountyOverviewInput,
): Promise<CountyOverview> {
  if (leadIndex.countyOverview === undefined) throw new CountyOverviewUnavailableError();
  const query: CountyOverviewQuery = {
    zoom: input.zoom,
    ...(input.roofAgeMinYears === undefined ? {} : { roofAgeMinYears: input.roofAgeMinYears }),
    ...(input.propertyUsageType === undefined
      ? {}
      : { propertyUsageType: input.propertyUsageType }),
    ...(input.permits === undefined ? {} : { permits: input.permits }),
    ...(input.permitStatus === undefined ? {} : { permitStatus: input.permitStatus }),
    ...(input.permitOpenDaysMin === undefined
      ? {}
      : { permitOpenDaysMin: input.permitOpenDaysMin }),
  };
  return leadIndex.countyOverview(query);
}
