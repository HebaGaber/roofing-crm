// B-03 Map URL state (plan.md "Patterns the code must show": "radius/threshold/permit-view are
// shareable and restorable from the URL"). Replaces the A-13/ORACLE-u Explore-page version this
// file was copied from (C1 copy, 2026-10-23): that version's `place`/`tenure`/`ooa`/`sort`/
// gazetteer machinery belongs to Task A's place-based Explorer, not this story's pin/GPS +
// radius Map (no place search). The owner filters came back later (Task A's "Owner" group):
// `tenure` and `ooa`, parsed exactly like `roof`. Kept: the URL-param pattern itself and the
// file's location/name (tasks.md T023a).
//
// URL keys: `lat`,`lng` (the search center pin/GPS point), `r` (radiusMi, 0.5-25),
// `roof` (roofAgeMinYears), `tenure` (tenureYearsMin, whole years 0-100), `ooa` (out-of-area
// owner, "1" or "true"), `permits` (permit-view toggle, "1"), `sel` (the selected
// propertyCid, opens the detail drawer). Values outside bounds are dropped, never clamped into a
// different question (FR-001/FR-003, matching the pattern the original file used).
import { DEFAULT_RADIUS_MI, MAX_RADIUS_MI, MIN_RADIUS_MI } from "@crm/domain";

export { DEFAULT_RADIUS_MI };
export const RADIUS_BOUNDS: readonly [number, number] = [MIN_RADIUS_MI, MAX_RADIUS_MI];
/** Upper bound of the owner-tenure filter (years); a value above it is dropped, not clamped. */
export const MAX_TENURE_YEARS = 100;

export interface MapCenter {
  readonly lat: number;
  readonly lng: number;
}

export interface MapQuery {
  readonly center: MapCenter | null;
  readonly radiusMi: number;
  readonly roofAgeMinYears: number | undefined;
  /** Owner filter: years since the latest dated sale, at least this many. */
  readonly tenureYearsMin: number | undefined;
  /** Owner filter: the owner's mailing ZIP is outside the Travis County area. */
  readonly outOfArea: boolean;
  readonly permitView: boolean;
  readonly sel: string | null;
}

const inRange = (value: number, [min, max]: readonly [number, number]): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

function parseCenter(params: URLSearchParams): MapCenter | null {
  const lat = params.get("lat");
  const lng = params.get("lng");
  if (lat === null || lng === null) return null;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!inRange(latNum, [-90, 90]) || !inRange(lngNum, [-180, 180])) return null;
  return { lat: latNum, lng: lngNum };
}

function parseRadius(params: URLSearchParams): number {
  const raw = params.get("r");
  if (raw === null || raw.trim() === "") return DEFAULT_RADIUS_MI;
  const value = Number(raw);
  return inRange(value, RADIUS_BOUNDS) ? value : DEFAULT_RADIUS_MI;
}

function parseRoofAgeMinYears(params: URLSearchParams): number | undefined {
  const raw = params.get("roof");
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  // Values outside bounds are dropped (no filter), never clamped into a different question
  // (header comment above, FR-001/FR-003) — an invalid/negative/non-integer value must NOT fall
  // back to DEFAULT_ROOF_AGE_YEARS, which would silently apply a filter the URL never asked for
  // (found in review, CR-B-03).
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function parseTenureYearsMin(params: URLSearchParams): number | undefined {
  const raw = params.get("tenure");
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  // Dropped (no filter) when not a whole number in 0-100, never clamped.
  return Number.isInteger(value) && value >= 0 && value <= MAX_TENURE_YEARS ? value : undefined;
}

function parseOutOfArea(params: URLSearchParams): boolean {
  const raw = params.get("ooa");
  return raw === "1" || raw === "true";
}

export function parseMapQuery(params: URLSearchParams): MapQuery {
  return {
    center: parseCenter(params),
    radiusMi: parseRadius(params),
    roofAgeMinYears: parseRoofAgeMinYears(params),
    tenureYearsMin: parseTenureYearsMin(params),
    outOfArea: parseOutOfArea(params),
    permitView: params.get("permits") === "1",
    sel: params.get("sel"),
  };
}

export type MapQueryPatch = Partial<{
  lat: number | null;
  lng: number | null;
  r: number | null;
  roof: number | null;
  tenure: number | null;
  ooa: boolean | null;
  permits: boolean | null;
  sel: string | null;
}>;

/** Applies a patch of URL values (undefined/null/false removes the key). */
export function patchMapParams(params: URLSearchParams, patch: MapQueryPatch): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === false) next.delete(key);
    else next.set(key, value === true ? "1" : String(value));
  }
  return next;
}
