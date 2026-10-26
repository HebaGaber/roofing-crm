// Map search box logic (pure, no React): what the typed text is, and which suggestions the vendored
// Travis gazetteer gives for it. Exact permit / TCAD lookups go through the API (search.byPermitNumber,
// search.byTcadId); street addresses are not published in Run 3, so that path is a disabled option
// behind one seam (`addressSource`).
import { gazetteer } from "@crm/oracle-views";

export type QueryKind = "empty" | "place" | "zip" | "permit" | "tcad" | "address";

export type SearchOptionKind = "place" | "zip" | "permit" | "tcad" | "address";

export interface SearchOption {
  /** Unique within one listbox; used for the option element id. */
  readonly id: string;
  readonly kind: SearchOptionKind;
  readonly label: string;
  /** Secondary line (what picking it does, or why it is disabled). */
  readonly detail?: string;
  readonly disabled?: boolean;
  /** Place and ZIP options: where the map centres. */
  readonly point?: { readonly lat: number; readonly lng: number };
  /** Permit and TCAD options: the value sent to the API. */
  readonly lookup?: string;
}

/** Shown under the gazetteer options. */
export const GAZETTEER_PROVENANCE = `Census 2024 Gazetteer · ${gazetteer.GAZETTEER_VERSION}`;

export const ADDRESS_UNAVAILABLE_REASON = "Street addresses are not published yet";

const PERMIT_RE = /^\d{4}-\d{6}(?:\s*BP)?$/i;
const ZIP_RE = /^(?:zip\s*)?\d{3,5}$/i;
const TCAD_RE = /^\d{6,8}$/;
const ADDRESS_RE = /^\d+\s+\p{L}/u;

/** What the text looks like. A 3-5 digit number is a ZIP (a 5-digit TCAD account that is not a
 *  ZIP is offered by `optionsFor`); 6-8 digits are a TCAD account. */
export function classifyQuery(text: string): QueryKind {
  const q = text.trim().replace(/\s+/g, " ");
  if (q === "") return "empty";
  if (PERMIT_RE.test(q)) return "permit";
  if (ZIP_RE.test(q)) return "zip";
  if (TCAD_RE.test(q)) return "tcad";
  if (ADDRESS_RE.test(q)) return "address";
  return "place";
}

/** The permit number as stored: `2026-121002 BP` (the suffix is added when omitted). */
export function normalisePermit(text: string): string {
  const digits = text.trim().slice(0, 11);
  return `${digits} BP`;
}

const MAX_GAZETTEER_OPTIONS = 6;

function zipDigits(text: string): string {
  return text.trim().replace(/^zip\s*/i, "");
}

function zipOption(found: Extract<ReturnType<typeof gazetteer.lookup>, { kind: "zcta" }>) {
  return {
    id: `zip-${found.zcta}`,
    kind: "zip" as const,
    label: found.zcta,
    detail: "ZIP code (ZCTA)",
    point: { lat: found.point.lat, lng: found.point.lon },
  };
}

/** Places whose name starts with the text, and ZIP codes (ZCTAs) starting with a 3-5 digit text.
 *  Only entries the gazetteer holds with coordinates are suggested. */
export function suggestFromGazetteer(query: string): SearchOption[] {
  const kind = classifyQuery(query);
  if (kind === "place") {
    return gazetteer
      .searchPlaces(query, MAX_GAZETTEER_OPTIONS)
      .filter((f) => f.kind === "place")
      .map((f) => ({
        id: `place-${f.geoid}`,
        kind: "place" as const,
        label: f.name,
        detail: f.partial_in_travis ? "Place, partly in Travis County" : "Place in Travis County",
        point: { lat: f.point.lat, lng: f.point.lon },
      }));
  }
  if (kind === "zip") {
    const digits = zipDigits(query);
    const span = 5 - digits.length;
    const start = Number(digits) * 10 ** span;
    const out: SearchOption[] = [];
    for (let i = 0; i < 10 ** span && out.length < MAX_GAZETTEER_OPTIONS; i += 1) {
      const found = gazetteer.lookup(String(start + i).padStart(5, "0"));
      if (found.status === "found" && found.kind === "zcta") out.push(zipOption(found));
    }
    return out;
  }
  return [];
}

/** The one seam for street-address search. Run 3 publishes no street addresses and the CRM index
 *  has no address column, so this returns nothing. When Run 3.1 publishes `unnormalized_address`,
 *  return real matches here (and drop the disabled option in `optionsFor`). */
export function addressSource(_query: string): SearchOption[] {
  return [];
}

/** Everything the listbox shows for typed text (not the exact-lookup results, which are async). */
export function optionsFor(query: string): SearchOption[] {
  const q = query.trim().replace(/\s+/g, " ");
  switch (classifyQuery(q)) {
    case "empty":
      return [];
    case "place":
      return suggestFromGazetteer(q);
    case "zip": {
      const zips = suggestFromGazetteer(q);
      const digits = zipDigits(q);
      // A 5-digit number that is no Travis ZIP may still be a TCAD account number.
      if (zips.length === 0 && digits.length === 5 && !/^zip/i.test(q)) {
        return [tcadOption(digits)];
      }
      return zips;
    }
    case "permit": {
      const permit = normalisePermit(q);
      return [
        {
          id: `permit-${permit}`,
          kind: "permit",
          label: `Permit ${permit}`,
          detail: "Open the property this permit belongs to",
          lookup: permit,
        },
      ];
    }
    case "tcad":
      return [tcadOption(q)];
    case "address": {
      const found = addressSource(q);
      if (found.length > 0) return found;
      return [
        {
          id: "address-unavailable",
          kind: "address",
          label: q,
          detail: ADDRESS_UNAVAILABLE_REASON,
          disabled: true,
        },
      ];
    }
  }
}

function tcadOption(value: string): SearchOption {
  return {
    id: `tcad-${value}`,
    kind: "tcad",
    label: `TCAD account ${value}`,
    detail: "Open the property with this account number",
    lookup: value,
  };
}

export interface SearchSample {
  readonly label: string;
  /** What is typed into the box when the sample is picked. */
  readonly query: string;
  readonly verified: string;
}

/** "Try" examples for the empty box, the one list the box renders. The permit and TCAD samples are
 *  pinned to the data of Run 3: they are real rows in that run and must be re-checked (or removed)
 *  when a later run is promoted. The visible labels carry no run number.
 *
 *  Each is searched for real on the current data (travis-full-run3-20261025):
 *  - Pflugerville, Round Rock, Austin: places in the vendored gazetteer (travis-places@1.0.0),
 *    asserted by searchSuggest.test.ts.
 *  - 78660: a Travis ZCTA in the same gazetteer (same test).
 *  - 2026-121002 BP: an open Roofing permit read from the live Run 3 index via property.get on
 *    2026-10-25 (tests/e2e/lib/run-fixtures.ts, OPEN_PERMIT_NUMBER).
 *  - 138273: the requestIdentifier (TCAD account) of that same property (LEAD_FIXTURES.openPermit). */
export const SEARCH_SAMPLES: readonly SearchSample[] = [
  { label: "Pflugerville", query: "Pflugerville", verified: "gazetteer place" },
  { label: "78660", query: "78660", verified: "gazetteer ZCTA" },
  { label: "Round Rock", query: "Round Rock", verified: "gazetteer place" },
  { label: "Permit 2026-121002 BP", query: "2026-121002 BP", verified: "Run 3 live index" },
  { label: "TCAD account 138273", query: "138273", verified: "Run 3 live index" },
];
