// Zoomed-out overview (design-review-log row 10; CRM-HANDOFF E-67/E-72; prototype Explore1440
// `heat`): properties aggregated into pointy-top hexagons in Web Mercator pixel space at the
// map's whole-number zoom, coloured by median roof age. Pure and O(n) (plus a per-cell sort for
// the median), with no dependency: a full county (441,961 rows) bins in well under a second.
// The roof-age scale is the shared one in `src/format/buckets.ts`, never re-derived here.
import { roofAgeBucket } from "../../format/buckets.js";

/** Below this zoom the map shows the hexagon overview; at or above it, individual markers.
 *  The county view opens at 9; a pin's radius view lands at 11–13. */
export const OVERVIEW_MAX_ZOOM = 11;

export function isOverviewZoom(zoom: number): boolean {
  return zoom < OVERVIEW_MAX_ZOOM;
}

export interface HexPoint {
  readonly lat: number;
  readonly lng: number;
  readonly roofAgeYears: number | null;
}

export interface HexCell {
  readonly id: string;
  /** Cell centre, [lng, lat]. */
  readonly center: readonly [number, number];
  /** Closed ring of seven [lng, lat] points. */
  readonly ring: readonly (readonly [number, number])[];
  readonly count: number;
  /** Properties with a published roof age. */
  readonly withRoofAge: number;
  /** Median of the published roof ages; null when none is published. */
  readonly medianRoofAge: number | null;
  /** Properties whose roof age is at least `agedYears`. */
  readonly agedCount: number;
}

export interface HexbinOptions {
  readonly zoom: number;
  /** Hexagon radius on screen at the whole-number zoom, px. */
  readonly radiusPx?: number;
  /** Aged-roof threshold, years (the Filters default is 15). */
  readonly agedYears?: number;
}

const TILE = 256;
const SQRT3 = Math.sqrt(3);

function project(lng: number, lat: number, world: number): [number, number] {
  const x = ((lng + 180) / 360) * world;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
  return [x, y];
}

function unproject(x: number, y: number, world: number): [number, number] {
  const lng = (x / world) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / world);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return [lng, lat];
}

/** Axial (q, r) of the hexagon containing pixel (x, y), cube-rounded. */
function axialOf(x: number, y: number, size: number): [number, number] {
  const qf = ((SQRT3 / 3) * x - y / 3) / size;
  const rf = ((2 / 3) * y) / size;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return [q, r];
}

function median(sorted: readonly number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = n >> 1;
  return n % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

interface Acc {
  q: number;
  r: number;
  count: number;
  ages: number[];
  aged: number;
}

export function hexbin(points: readonly HexPoint[], options: HexbinOptions): HexCell[] {
  const z = Math.max(0, Math.floor(options.zoom));
  const world = TILE * 2 ** z;
  const size = options.radiusPx ?? 24;
  const agedYears = options.agedYears ?? 15;
  const cells = new Map<string, Acc>();

  for (const point of points) {
    const [x, y] = project(point.lng, point.lat, world);
    const [q, r] = axialOf(x, y, size);
    const key = `${q}:${r}`;
    let acc = cells.get(key);
    if (acc === undefined) {
      acc = { q, r, count: 0, ages: [], aged: 0 };
      cells.set(key, acc);
    }
    acc.count += 1;
    const age = point.roofAgeYears;
    if (age !== null && Number.isFinite(age)) {
      acc.ages.push(age);
      if (age >= agedYears) acc.aged += 1;
    }
  }

  const out: HexCell[] = [];
  for (const [key, acc] of cells) {
    const cx = size * SQRT3 * (acc.q + acc.r / 2);
    const cy = size * 1.5 * acc.r;
    const ring: [number, number][] = [];
    for (let i = 0; i <= 6; i += 1) {
      const angle = ((60 * (i % 6) - 30) * Math.PI) / 180;
      ring.push(unproject(cx + size * Math.cos(angle), cy + size * Math.sin(angle), world));
    }
    acc.ages.sort((a, b) => a - b);
    out.push({
      id: `${z}:${key}`,
      center: unproject(cx, cy, world),
      ring,
      count: acc.count,
      withRoofAge: acc.ages.length,
      medianRoofAge: median(acc.ages),
      agedCount: acc.aged,
    });
  }
  return out;
}

export interface HexFeatureProperties {
  readonly id: string;
  readonly count: number;
  readonly medianRoofAge: number | null;
  readonly agedCount: number;
  /** The `--viz-roof-age-*` token of the median, or `none` when no roof age is published. */
  readonly token: string;
  readonly centerLng: number;
  readonly centerLat: number;
}

export interface HexFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: {
    readonly type: "Feature";
    readonly id: number;
    readonly properties: HexFeatureProperties;
    readonly geometry: {
      readonly type: "Polygon";
      readonly coordinates: (readonly (readonly [number, number])[])[];
    };
  }[];
}

export function hexCellsToFeatureCollection(cells: readonly HexCell[]): HexFeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((cell, index) => ({
      type: "Feature",
      id: index,
      properties: {
        id: cell.id,
        count: cell.count,
        medianRoofAge: cell.medianRoofAge,
        agedCount: cell.agedCount,
        token: roofAgeBucket(cell.medianRoofAge)?.token ?? "none",
        centerLng: cell.center[0],
        centerLat: cell.center[1],
      },
      geometry: { type: "Polygon", coordinates: [cell.ring] },
    })),
  };
}
