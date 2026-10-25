// Candidate model shared by the Candidate list (`/map?view=list`) and Field triage
// (`/map?triage=1`), CRM-HANDOFF §4.3/§4.4. Pure functions only: it joins the map's own
// `search.properties` rows with the `search.permits` rows of the same ring and the caller's lead
// presence (`leads.list`), then sorts. Every value is read verbatim from those responses; nothing
// is derived that the contract does not publish (no address, no contractor name, no BBB score).
import { distanceMeters, isLongOpen, type LatLng } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type { LeadStatus } from "@crm/shared";
import { permitStatusShortLabel, roofAgeConfidenceLabel } from "../../../format/index.js";

export type CandidateSort = "roof" | "open" | "near";
export type PermitStatusFilter = "any" | "open" | "stalled";

/** The map's filters, as the map holds them (URL plus its local permit filters). */
export interface CandidateFilters {
  readonly center: LatLng | null;
  readonly radiusMi: number;
  readonly roofAgeMinYears?: number | undefined;
  readonly permitStatus?: PermitStatusFilter | undefined;
  /** Permit open ≥ N years. */
  readonly permitOpenYrs?: number | undefined;
}

/** What the CRM lead store says about a property (one of the caller's leads). */
export interface CandidateLead {
  readonly leadKey: string;
  readonly leadId: string;
  readonly status: LeadStatus;
}

export type CandidateProperty = Provenanced<CrmProperty>;
export type CandidatePermit = Provenanced<CrmPermit>;

export interface Candidate {
  readonly property: CandidateProperty;
  /** This property's permits in the ring that pass the permit filters. */
  readonly permits: readonly CandidatePermit[];
  /** The main signal's permit: the open or stalled one open longest, else null. */
  readonly mainPermit: CandidatePermit | null;
  readonly distanceMi: number | null;
  /** 8-point compass bearing from the centre, e.g. `SE`. */
  readonly bearing: string | null;
  readonly lead: CandidateLead | null;
}

const METERS_PER_MILE = 1609.344;
const YEAR_DAYS = 365.25;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 8-point compass bearing from `from` to `to` (initial great-circle bearing). */
export function compassBearing(from: LatLng, to: LatLng): string {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lng - from.lng) * rad) * Math.cos(to.lat * rad);
  const x =
    Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
    Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lng - from.lng) * rad);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8] ?? "N";
}

const isOpenOrStalled = (p: CandidatePermit): boolean =>
  p.statusClass === "open" || p.statusClass === "stalled";

function permitPasses(permit: CandidatePermit, filters: CandidateFilters): boolean {
  const status = filters.permitStatus ?? "any";
  if (status !== "any" && permit.statusClass !== status) return false;
  if (filters.permitOpenYrs !== undefined) {
    if (permit.openDays === null || permit.openDays / YEAR_DAYS < filters.permitOpenYrs)
      return false;
  }
  return true;
}

/** The `search.permits` input for the map's filters. The server filters (status and open days) and
 *  pages (500 longest open first); the map, the Candidate list and Field triage all build their
 *  input here, so they share one React Query cache entry. */
export function permitQueryInput(
  center: LatLng | null,
  radiusMi: number,
  permitStatus: PermitStatusFilter | undefined,
  permitOpenYrs: number | undefined,
): {
  center: LatLng;
  radiusMi: number;
  sort: "openDays";
  statusClass?: ("open" | "stalled")[];
  openDaysMin?: number;
} {
  const status = permitStatus ?? "any";
  return {
    center: center ?? { lat: 0, lng: 0 },
    radiusMi,
    sort: "openDays",
    ...(status === "any" ? {} : { statusClass: [status] }),
    // The same cut the map's own "Permit open at least N yrs" filter always made: openDays is a
    // whole number, so at least ceil(N years in days).
    ...(permitOpenYrs === undefined ? {} : { openDaysMin: Math.ceil(permitOpenYrs * YEAR_DAYS) }),
  };
}

/** The server's permit page ceiling (`search.permits` caps at 500). */
export const PERMIT_PAGE_MAX = 500;

/** The honest line when the server clipped the permits: never a page presented as the whole set. */
export function permitNote(
  page: { total: number; truncated: boolean; shown?: number } | undefined,
): string | null {
  if (page === undefined || !page.truncated) return null;
  return `Showing the ${String(page.shown ?? PERMIT_PAGE_MAX)} longest-open of ${page.total.toLocaleString("en-US")} permits in range; narrow the radius or filters.`;
}

/** True when a permit filter narrows the matches to properties with a matching permit. */
export function hasPermitFilter(filters: CandidateFilters): boolean {
  return (filters.permitStatus ?? "any") !== "any" || filters.permitOpenYrs !== undefined;
}

/** Index of lead presence by the property's TCAD request identifier (`{fips}:tcad:{id}`). */
export function leadsByRequestIdentifier(
  leads: readonly CandidateLead[],
): ReadonlyMap<string, CandidateLead> {
  const map = new Map<string, CandidateLead>();
  for (const lead of leads) {
    const at = lead.leadKey.indexOf(":tcad:");
    if (at !== -1) map.set(lead.leadKey.slice(at + ":tcad:".length), lead);
  }
  return map;
}

/** Joins properties, permits and lead presence into candidates, in the API's order. */
export function buildCandidates(
  properties: readonly CandidateProperty[],
  permits: readonly CandidatePermit[],
  leads: ReadonlyMap<string, CandidateLead>,
  filters: CandidateFilters,
): Candidate[] {
  const byProperty = new Map<string, CandidatePermit[]>();
  for (const permit of permits) {
    if (!permitPasses(permit, filters)) continue;
    byProperty.set(permit.propertyCid, [...(byProperty.get(permit.propertyCid) ?? []), permit]);
  }
  const permitFilter = hasPermitFilter(filters);
  const out: Candidate[] = [];
  for (const property of properties) {
    const own = byProperty.get(property.propertyCid) ?? [];
    if (permitFilter && own.length === 0) continue;
    const mainPermit =
      [...own].filter(isOpenOrStalled).sort((a, b) => (b.openDays ?? -1) - (a.openDays ?? -1))[0] ??
      null;
    const point =
      property.latitude === null || property.longitude === null
        ? null
        : { lat: property.latitude, lng: property.longitude };
    const center = filters.center;
    out.push({
      property,
      permits: own,
      mainPermit,
      distanceMi:
        center === null || point === null ? null : distanceMeters(center, point) / METERS_PER_MILE,
      bearing: center === null || point === null ? null : compassBearing(center, point),
      lead: leads.get(property.requestIdentifier) ?? null,
    });
  }
  return out;
}

/** CRM-HANDOFF §4.2: a permit filter makes "Permit open (longest)" the default sort. */
export function defaultSort(filters: CandidateFilters): CandidateSort {
  return hasPermitFilter(filters) ? "open" : "roof";
}

export const SORT_LABEL: Readonly<Record<CandidateSort, string>> = {
  roof: "Roof age (oldest)",
  open: "Permit open (longest)",
  near: "Nearest",
};

/** Stable sort; unknown values (null) always go last, never treated as 0. */
export function sortCandidates(list: readonly Candidate[], sort: CandidateSort): Candidate[] {
  const key = (c: Candidate): number | null =>
    sort === "roof"
      ? c.property.roofAgeYears
      : sort === "open"
        ? (c.mainPermit?.openDays ?? null)
        : c.distanceMi;
  const desc = sort !== "near";
  return list
    .map((c, i) => ({ c, i, k: key(c) }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      const d = desc ? b.k - a.k : a.k - b.k;
      return d === 0 ? a.i - b.i : d;
    })
    .map((x) => x.c);
}

/** `6.4 yrs` from the published `openDays`; never recomputed from dates. */
export function openYearsText(openDays: number | null): string | null {
  if (openDays === null) return null;
  return `${Math.round((openDays / YEAR_DAYS) * 10) / 10} yrs`;
}

/** "Stalled 6.4 yrs · derived: no status in source" / "Open 3.8 yrs" (design-review-log row 6). */
export function permitSignalText(permit: Pick<CrmPermit, "statusClass" | "openDays">): string {
  const years = openYearsText(permit.openDays);
  const head = `${permitStatusShortLabel(permit.statusClass)} ${years ?? "· open duration not published"}`;
  return permit.statusClass === "stalled" ? `${head} · derived: no status in source` : head;
}

/** The main signal for the confirmation sheet: the open or stalled permit, else the roof. */
export function mainSignalText(candidate: Candidate): string {
  if (candidate.mainPermit !== null) return `Permit ${permitSignalText(candidate.mainPermit)}`;
  const { roofAgeYears, roofAgeConfidence } = candidate.property;
  if (roofAgeYears === null) return "Roof age not published";
  return `Roof ${roofAgeYears} yrs · ${roofAgeConfidenceLabel(roofAgeConfidence)} confidence`;
}

export function isLongOpenPermit(permit: CandidatePermit | null): boolean {
  return permit !== null && isLongOpen(permit.openDays);
}

/** "Why is this a lead?" (CRM-HANDOFF §4.3/§4.4): only the conditions the row actually meets. */
export function whyChips(candidate: Candidate, filters: CandidateFilters): string[] {
  const chips: string[] = [];
  const { roofAgeYears, roofAgeConfidence } = candidate.property;
  if (roofAgeYears !== null) {
    const threshold =
      filters.roofAgeMinYears === undefined ? "" : ` ≥ ${String(filters.roofAgeMinYears)}`;
    chips.push(
      `Roof ${roofAgeYears} yrs${threshold} · ${roofAgeConfidenceLabel(roofAgeConfidence)} confidence`,
    );
  }
  if (candidate.mainPermit !== null) chips.push(permitSignalText(candidate.mainPermit));
  if (candidate.distanceMi !== null) {
    chips.push(`${candidate.distanceMi.toFixed(1)} mi ≤ ${String(filters.radiusMi)} mi`);
  }
  return chips;
}

/** The candidate's title (E-93): TCAD account id, never an invented street address. */
export function candidateTitle(property: CandidateProperty): string {
  return `TCAD ${property.requestIdentifier}`;
}

/** "Address not published in this run · 30.39655, -97.67912". */
export function candidateSubtitle(property: CandidateProperty, digits = 5): string {
  const coords =
    property.latitude === null || property.longitude === null
      ? ""
      : ` · ${property.latitude.toFixed(digits)}, ${property.longitude.toFixed(digits)}`;
  return `Address not published in this run${coords}`;
}

/** Roof presets shared with the filters (10, 13, 15, 20, 25). */
export const ROOF_PRESETS: readonly number[] = [10, 13, 15, 20, 25];

/** The next lower roof preset, for the empty state's "Roof ≥ M yrs" chip; null if none. */
export function lowerRoofPreset(current: number | undefined): number | null {
  if (current === undefined) return null;
  const lower = ROOF_PRESETS.filter((p) => p < current);
  return lower.length === 0 ? null : (lower[lower.length - 1] ?? null);
}

/** The table/card basis in the boards' short words ("reroof permit", "year built"). */
export function shortBasis(basis: CandidateProperty["roofAgeBasis"]): string {
  switch (basis) {
    case "permit":
      return "reroof permit";
    case "built_year":
      return "year built";
    case "new_construction":
      return "new construction";
    case "unknown":
      return "basis unknown";
  }
}
