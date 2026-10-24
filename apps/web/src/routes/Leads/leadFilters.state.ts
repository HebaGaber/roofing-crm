// B-07 T023: lead list URL state (AC-4: filter combinations are shareable and restorable from the
// URL). Same pattern as Map/ExploreFilters.state.ts: parse is total (never throws), values outside
// bounds are dropped rather than clamped into a different question, and `patch` returns a new
// URLSearchParams.
//
// URL keys: `roof` (roofAgeMinYears), `permit` (open|stalled; no "closed": design-review-log row 6,
// the CRM's permit filter is Open / Stalled / Any), `lat`,`lng` (the area center) with `r`
// (radiusMi), `status`, `assignee`, `cursor` (opaque page cursor from leads.list). Example:
// /leads?status=new&assignee=rep%40example.com&roof=20&permit=open&lat=30.5&lng=-97.6&r=10
import { MAX_RADIUS_MI, MIN_RADIUS_MI } from "@crm/domain";
import { LEAD_STATUSES, type LeadFilters, type LeadStatus } from "@crm/shared";

export const DEFAULT_LEAD_RADIUS_MI = 5;
export const LEAD_PAGE_SIZE = 25;
/** The permit filters the CRM offers (design-review-log row 6). `leads.list` also accepts "closed";
 *  the CRM never asks for it, and a `permit=closed` link is read as no permit filter. */
export const PERMIT_STATUSES = ["open", "stalled"] as const;
/** "Within" presets, inside the shared 0.5-25 mi bounds (@crm/domain). */
export const RADIUS_PRESETS_MI: readonly number[] = [0.5, 1, 2, 5, 10, 25];
export type LeadPermitStatus = (typeof PERMIT_STATUSES)[number];

export interface LeadCenter {
  readonly lat: number;
  readonly lng: number;
}

export interface LeadQuery {
  readonly roofAgeMinYears: number | undefined;
  readonly permitStatus: LeadPermitStatus | undefined;
  readonly center: LeadCenter | null;
  readonly radiusMi: number;
  readonly status: LeadStatus | undefined;
  readonly assignee: string | undefined;
  readonly cursor: string | undefined;
}

const inRange = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

function parseNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function parseLeadQuery(params: URLSearchParams): LeadQuery {
  const roof = parseNumber(params.get("roof"));
  const lat = parseNumber(params.get("lat"));
  const lng = parseNumber(params.get("lng"));
  const radius = parseNumber(params.get("r"));
  const permit = params.get("permit");
  const status = params.get("status");
  const assignee = params.get("assignee");
  const cursor = params.get("cursor");
  return {
    roofAgeMinYears: roof !== undefined && Number.isInteger(roof) && roof >= 0 ? roof : undefined,
    permitStatus: PERMIT_STATUSES.find((s) => s === permit),
    center:
      lat !== undefined && lng !== undefined && inRange(lat, -90, 90) && inRange(lng, -180, 180)
        ? { lat, lng }
        : null,
    radiusMi:
      radius !== undefined && inRange(radius, MIN_RADIUS_MI, MAX_RADIUS_MI)
        ? radius
        : DEFAULT_LEAD_RADIUS_MI,
    status: LEAD_STATUSES.find((s) => s === status),
    assignee: assignee === null || assignee.trim() === "" ? undefined : assignee,
    cursor: cursor === null || cursor === "" ? undefined : cursor,
  };
}

export type LeadQueryPatch = Partial<{
  roof: number | null;
  permit: LeadPermitStatus | null;
  lat: number | null;
  lng: number | null;
  r: number | null;
  status: LeadStatus | null;
  assignee: string | null;
  cursor: string | null;
}>;

/** Applies a patch (undefined/null removes the key). Any change other than the cursor itself
 *  starts again from the first page, so a stale cursor never outlives the filters it belongs to. */
export function patchLeadParams(params: URLSearchParams, patch: LeadQueryPatch): URLSearchParams {
  const next = new URLSearchParams(params);
  const changesFilters = Object.keys(patch).some((key) => key !== "cursor");
  if (changesFilters) next.delete("cursor");
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export interface LeadsListInput {
  readonly filters?: LeadFilters;
  readonly status?: LeadStatus;
  readonly assignee?: string;
  readonly cursor?: string;
  readonly limit: number;
}

/** The `leads.list` input (contracts/leads.md). Radius is only meaningful with a center, so it is
 *  never sent alone. Filters are omitted entirely when none applies. */
export function toLeadsListInput(query: LeadQuery): LeadsListInput {
  const filters: LeadFilters = {
    ...(query.roofAgeMinYears === undefined ? {} : { roofAgeMinYears: query.roofAgeMinYears }),
    ...(query.permitStatus === undefined ? {} : { permitStatus: query.permitStatus }),
    ...(query.center === null
      ? {}
      : { radiusMi: query.radiusMi, centerLat: query.center.lat, centerLon: query.center.lng }),
  };
  return {
    ...(Object.keys(filters).length === 0 ? {} : { filters }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.assignee === undefined ? {} : { assignee: query.assignee }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: LEAD_PAGE_SIZE,
  };
}

export function hasActiveFilters(query: LeadQuery): boolean {
  return (
    query.roofAgeMinYears !== undefined ||
    query.permitStatus !== undefined ||
    query.center !== null ||
    query.status !== undefined ||
    query.assignee !== undefined
  );
}

/** How many filters are on. The area and its radius are one filter (the radius alone is not). */
export function activeFilterCount(query: LeadQuery): number {
  return [
    query.status !== undefined,
    query.assignee !== undefined,
    query.roofAgeMinYears !== undefined,
    query.permitStatus !== undefined,
    query.center !== null,
  ].filter(Boolean).length;
}

/** "Show on map": the map's own URL keys (Map/ExploreFilters.state.ts reads `lat`,`lng`,`r`,
 *  `roof` and `permits=1`, the permit layer). The map has no lead-status, assignee or
 *  permit-status key, so those stay on the list. */
export function leadsMapHref(query: LeadQuery): string {
  const params = new URLSearchParams();
  if (query.center !== null) {
    params.set("lat", String(query.center.lat));
    params.set("lng", String(query.center.lng));
    params.set("r", String(query.radiusMi));
  }
  if (query.roofAgeMinYears !== undefined) params.set("roof", String(query.roofAgeMinYears));
  if (query.permitStatus !== undefined) params.set("permits", "1");
  const search = params.toString();
  return search === "" ? "/map" : `/map?${search}`;
}
