// "Why is this a lead?" (CRM-HANDOFF §4.3, boards Explore1440 `whyView`): every rule the property
// meets, its value, the source, the run and the CID. Only conditions the row really meets are
// listed, and every value is read from the row (never recomputed or invented); a signal the data
// does not carry is left out rather than shown as met.
import type { LatLng } from "@crm/domain";
import { openDurationLabel } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { humanizeCode, roofAgeConfidenceLabel } from "../../format/index.js";
import { bbbHref } from "./BbbLink.js";
import { safeSourceHref } from "./SourceLink.js";
import { directionLabel, distanceFromCentre } from "./resultsView.js";

export interface WhyRule {
  readonly key: string;
  readonly rule: string;
  readonly value: string;
  /** "TCAD parcels · Run 3" */
  readonly source: string;
  readonly cid: string;
  /** An outbound link that belongs to the rule (the contractor's BBB search). */
  readonly link?: { readonly label: string; readonly href: string };
}

export interface WhyCoordinates {
  readonly text: string;
  readonly source: string;
  readonly direction: string | null;
  readonly osmUrl: string;
  /** The TCAD source record Task A published (https only); null when absent or not https. */
  readonly sourceUrl: string | null;
}

export interface WhyLead {
  readonly rules: readonly WhyRule[];
  readonly coordinates: WhyCoordinates | null;
}

/** `travis-full-run3-20261025` → `Run 3`; any other run id is shown as it is. */
export function runLabel(runId: string): string {
  const match = /run(\d+)/i.exec(runId);
  return match?.[1] === undefined ? runId : `Run ${match[1]}`;
}

const COORDINATE_SOURCES: Record<CrmProperty["coordinateSource"], string> = {
  gis_centroid: "TCAD parcel centroid",
  address_point: "City of Austin address point",
  permit_point: "Austin permit location",
  none: "No coordinates",
};

/** The open or stalled permit open longest: the lead's main signal (candidates.ts uses the same). */
export function mainPermitOf(
  permits: readonly Provenanced<CrmPermit>[] | undefined,
): Provenanced<CrmPermit> | null {
  const live = (permits ?? []).filter(
    (p) => p.statusClass === "open" || p.statusClass === "stalled",
  );
  if (live.length === 0) return null;
  return [...live].sort((a, b) => (b.openDays ?? -1) - (a.openDays ?? -1))[0] ?? null;
}

export interface WhyInput {
  readonly property: Provenanced<CrmProperty>;
  readonly permits?: readonly Provenanced<CrmPermit>[] | undefined;
  readonly center?: LatLng | undefined;
  readonly radiusMi?: number | undefined;
  /** "the pin", "you" or a place name. */
  readonly centreLabel?: string | undefined;
}

export function whyLead({ property, permits, center, radiusMi, centreLabel }: WhyInput): WhyLead {
  const run = runLabel(property.runId);
  const rules: WhyRule[] = [];

  const from =
    center === undefined ? null : distanceFromCentre(center, property.latitude, property.longitude);
  if (center !== undefined && from !== null && radiusMi !== undefined) {
    rules.push({
      key: "distance",
      rule: `Within ${String(radiusMi)} mi of ${centreLabel ?? "the search centre"}`,
      value: `${from.miles.toFixed(1)} mi from the search centre to the parcel centre`,
      source: `${property.coordinateSource === "address_point" ? "City of Austin address points" : "TCAD parcels"} · ${run}`,
      cid: property.cid,
    });
  }

  if (property.roofAgeYears !== null) {
    const estimated =
      property.roofAgeBasis === "built_year" || property.roofAgeBasis === "new_construction";
    rules.push({
      key: "roof",
      rule: `Roof age ${String(property.roofAgeYears)} yrs`,
      value: `${humanizeCode(property.roofAgeBasis)}${estimated ? " (estimated from year built)" : ""}${property.roofAgeBasis === "built_year" && property.structureBuiltYear != null ? ` · Year built ${String(property.structureBuiltYear)}` : ""} · ${roofAgeConfidenceLabel(property.roofAgeConfidence).toLowerCase()} confidence`,
      source: `${property.roofAgeBasis === "permit" ? "Austin permits" : "TCAD parcels"} · ${run}`,
      cid: property.cid,
    });
  }

  const main = mainPermitOf(permits);
  if (main !== null) {
    const contractor =
      main.contractorNameAsPrinted != null
        ? `contractor “${main.contractorNameAsPrinted}” as printed on the permit, unverified`
        : "no contractor printed on the permit";
    rules.push({
      key: "permit",
      rule: `Roofing permit ${main.statusClass ?? "open"}${main.statusClass === "stalled" ? " · derived: no status in source" : ""}`,
      value: `${openDurationLabel(main.openDays)} · ${contractor}`,
      source: `Austin permits · ${runLabel(main.runId)}`,
      cid: main.cid,
      ...(bbbHref(main.bbbUrl) === null
        ? {}
        : {
            link: { label: "Search BBB for this contractor", href: bbbHref(main.bbbUrl) as string },
          }),
    });
  }

  if (property.ownerKind != null && property.ownerKind !== "unknown") {
    const tenure =
      property.isLongTenure == null
        ? null
        : property.isLongTenure
          ? "owned 10+ years"
          : "owned under 10 years";
    const basis =
      property.tenureBasis != null && property.tenureBasis !== "unknown"
        ? ` (from ${humanizeCode(property.tenureBasis).toLowerCase()})`
        : "";
    rules.push({
      key: "owner",
      rule: "Owner",
      value: `${humanizeCode(property.ownerKind)} owner${tenure === null ? "" : ` · ${tenure}${basis}`}`,
      source: `TCAD owners · ${run}`,
      cid: property.cid,
    });
  }

  const { latitude, longitude } = property;
  const coordinates: WhyCoordinates | null =
    latitude === null || longitude === null
      ? null
      : {
          text: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          source: `${COORDINATE_SOURCES[property.coordinateSource]} · ${run}`,
          direction: from === null ? null : directionLabel(from),
          osmUrl: `https://www.openstreetmap.org/?mlat=${latitude.toFixed(5)}&mlon=${longitude.toFixed(5)}#map=18/${latitude.toFixed(5)}/${longitude.toFixed(5)}`,
          sourceUrl: safeSourceHref(property.sourceUrl),
        };

  return { rules, coordinates };
}
