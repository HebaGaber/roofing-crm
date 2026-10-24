// Thin-router extraction (tasks.md T013; agent-design.md alakazam §1: "services/propertyDetail.ts
// (from property.ts, including bbbFor/lineageUrl)"). The business logic previously inline in
// routers/property.ts, unchanged — never recomputing or guessing a BBB rating (ADR-07,
// constitution P0-4). routers/property.ts now only validates input and shapes the tRPC response
// (traceId, error mapping); the new agent `getProperty` tool (Phase 4) calls this same function
// instead of a second copy.
import type { LeadIndex, PermitResult, PropertyResult } from "../adapters/duckDbParquet.js";
import { nearestPlace, type NearestPlace } from "./agent/placeResolver.js";

/** contract/v1's `bbb_status` is pinned `BBB_SOURCE = "always not_checked in v1"`
 *  (packages/oracle-contract/src/columns.ts) — no live BBB lookup exists in this story's data
 *  (README; architecture-constitution.md ADR-08). `bbbStatusReason` follows the same derivation
 *  the vendored `v_roofing_permit`/`v_contractor` columns document ("contractor_unresolved if
 *  unresolved, else no_lexicon_carrier") — read verbatim from `CrmPermit.contractorResolution`,
 *  the field the index already carries, never a new guess. */
export function bbbFor(contractorResolution: string | null): {
  bbbStatus: "not_checked";
  bbbStatusReason: string;
} {
  return {
    bbbStatus: "not_checked",
    bbbStatusReason:
      contractorResolution === "resolved" ? "no_lexicon_carrier" : "contractor_unresolved",
  };
}

/** Task A ships as CountyLens at `countylens.aldarraj.com` (docs/02-design.md); its Explorer
 *  route opens a property's drawer via the `sel` URL param (the A-13 `ExploreFilters.state.ts`
 *  pattern this story's own copy still carries). `EXPLORER_BASE_URL` overrides the host for a
 *  non-default deploy; this never falls back to a placeholder — the path is fixed by Task A's
 *  own route shape, not invented here. */
export function lineageUrl(propertyCid: string): string {
  return `${countyLensBaseUrl()}/explore?sel=${encodeURIComponent(propertyCid)}`;
}

/** CountyLens's origin (no trailing slash): the one config read shared by the lineage link and
 *  the shell's Apps menu (routers/shell.ts), so both always point at the same deploy. */
export function countyLensBaseUrl(): string {
  const base = process.env.EXPLORER_BASE_URL ?? "https://countylens.aldarraj.com";
  return base.replace(/\/$/, "");
}

export interface PropertyDetailResult {
  property: PropertyResult | null;
  permits: PermitResult[];
  bbbStatus: "not_checked" | null;
  bbbStatusReason: string | null;
  lineageUrl: string;
  manifestCid: string;
  /** The nearest travis-places@1.0.0 place centroid to the property's coordinates, for the
   *  drawer header "TCAD {id} · near {place}" (E-93). Absent when the property is not in this
   *  run or has no coordinates — the drawer then says why from the row's own `missing` entry. */
  nearPlace?: NearestPlace;
}

/** contracts/property-detail.md step 1: never throws when the CID isn't in the currently
 *  promoted run — a typed "not in this run" null, per the existing B-02 `LeadIndex.getProperty`
 *  contract. */
export async function propertyDetail(
  leadIndex: LeadIndex,
  propertyCid: string,
): Promise<PropertyDetailResult> {
  const [found, { manifestCid }] = await Promise.all([
    leadIndex.getProperty(propertyCid),
    leadIndex.indexInfo(),
  ]);

  if (found === null) {
    return {
      property: null,
      permits: [],
      bbbStatus: null,
      bbbStatusReason: null,
      lineageUrl: lineageUrl(propertyCid),
      manifestCid,
    };
  }

  const { permits, ...property } = found;
  // v1 has exactly one bbb/contractor state per property (every permit's contractorResolution
  // agrees in this story's data — AC-7's edge case): the first permit's resolution stands for
  // the drawer-level field. A property with no permits at all is "unresolved" by the same
  // vendored fallback rule (no contractor can have been matched with nothing to match it on).
  const { bbbStatus, bbbStatusReason } = bbbFor(permits[0]?.contractorResolution ?? null);

  const near =
    property.latitude === null || property.longitude === null
      ? undefined
      : nearestPlace({ lat: property.latitude, lon: property.longitude });

  return {
    property,
    permits,
    bbbStatus,
    bbbStatusReason,
    lineageUrl: lineageUrl(propertyCid),
    manifestCid,
    ...(near === undefined ? {} : { nearPlace: near }),
  };
}
