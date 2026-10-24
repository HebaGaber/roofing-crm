// T021 (B-01) + T017 (B-03, US1): MapLibre wrapper. center is fixed on Travis County (bounds.ts);
// minZoom is derived once via map.cameraForBounds on load/resize, no maxBounds set (research.md).
// On a tile-load failure, renders the named CrmMapFailed390 state with a "Retry" action — never a
// blank grey grid (TC-007, the spec.md edge case closed at G5).
//
// B-03 adds: a click-to-drop pin (AC-1), a live radius ring redrawn from `center`/`radiusMi`
// (plan.md's "shared-rule requirement" — the ring's drawing geometry is a display-only
// equirectangular approximation, kept local to this component; the actual inside/outside-radius
// filtering decision always comes from the server's `search.properties`, which uses
// `packages/domain`'s exact `distanceMeters` haversine cut, never this preview math).
//
// Overview (design-review-log rows 10 and 69, CRM-HANDOFF E-67/E-72, PO 2026-10-25): below
// OVERVIEW_MAX_ZOOM the map shows hexagons coloured by median roof age and permit count clusters
// coloured by the longest open duration (MapLibre's own GeoJSON clustering, weighted by each
// point's `permits`). The cells come from `search.countyOverview` (`overviewCells`, the whole
// county); only when the caller has none does the component bin the loaded markers itself
// (hexbin.ts). A click on a hexagon drops a pin there (which zooms to its radius view), so the
// county view stays "tap the map to drop a pin"; a click on a permit cluster expands it. Both are
// WebGL layers, not DOM markers, so they stay fast with a full county. Every colour is an Atlas
// token, resolved from the DOM.
import {
  Map as MapLibreMap,
  Marker,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLibreEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PERMIT_OPEN_BUCKETS,
  ROOF_AGE_BUCKETS,
  permitOpenBucket,
  roofAgeBucket,
} from "../../format/buckets.js";
import { buildMapInitOptions, computeMinZoom, TRAVIS_COUNTY_CENTER } from "./bounds.js";
import {
  OVERVIEW_MAX_ZOOM,
  hexbin,
  hexCellsToFeatureCollection,
  isOverviewView,
  type HexCell,
  type OverviewPermitPoint,
} from "./hexbin.js";
import styles from "./CrmMap.module.css";

/** Default demo style: no API key required. MapLibre's own "demotiles" (the original default
 *  here) only carries data at world/country zoom — at this story's city-level radius-search zoom
 *  it rendered as a flat, featureless color block with no streets or landmarks (found live on
 *  the B-03 hosted preview). OpenFreeMap's "liberty" style is a full OSM-derived vector style,
 *  free and keyless, with real detail at every zoom this app uses. */
const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

const RADIUS_RING_SOURCE_ID = "crm-radius-ring";
const RADIUS_RING_FILL_LAYER_ID = "crm-radius-ring-fill";
const RADIUS_RING_LINE_LAYER_ID = "crm-radius-ring-line";
const RING_POINTS = 64;
const EARTH_RADIUS_M = 6_371_008.8;
const METERS_PER_MILE = 1609.344;
const HEX_SOURCE_ID = "crm-hex";
const HEX_FILL_LAYER_ID = "crm-hex-fill";
const HEX_LINE_LAYER_ID = "crm-hex-line";
const PERMIT_CLUSTER_SOURCE_ID = "crm-permit-clusters";
const PERMIT_CLUSTER_LAYER_ID = "crm-permit-clusters-circle";
const OVERVIEW_LAYER_IDS = [HEX_FILL_LAYER_ID, PERMIT_CLUSTER_LAYER_ID] as const;
/** The opening (whole-county) zoom. */
const COUNTY_ZOOM = 9;
/** Paint colours MapLibre cannot read from CSS variables: resolved from the live Atlas tokens.
 *  Only if a token is unset (never in the app, which loads tokens.css) does a CSS named colour
 *  stand in, so a paint call never fails. */
const UNSET_TOKEN_COLOR = "gray";

declare global {
  interface Window {
    /** Test-only: the live MapLibre map, set while a CrmMap is mounted (read by tests/e2e only). */
    __crmMap?: MapLibreMap;
  }
}

/** The live value of an Atlas token (`--md-sys-color-primary`), following dark mode. */
function resolveToken(token: string): string {
  if (typeof document === "undefined") return UNSET_TOKEN_COLOR;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value === "" ? UNSET_TOKEN_COLOR : value;
}

function resolvePrimaryColor(): string {
  return resolveToken("--md-sys-color-primary");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The ring's [[west, south], [east, north]] box, for fitting the view to a new pin. */
function ringBounds(center: LatLng, radiusMi: number): [[number, number], [number, number]] {
  const east = ringPoint(center, 90, radiusMi);
  const north = ringPoint(center, 0, radiusMi);
  const dLng = east[0] - center.lng;
  const dLat = north[1] - center.lat;
  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
  ];
}

/** Hexagon fill: the median's `--viz-roof-age-*` token; no published roof age → surface variant. */
function hexColorExpression(): ExpressionSpecification {
  const pairs = ROOF_AGE_BUCKETS.flatMap((b) => [b.token, resolveToken(b.token)]);
  return [
    "match",
    ["get", "token"],
    ...pairs,
    resolveToken("--md-sys-color-surface-container-highest"),
  ] as unknown as ExpressionSpecification;
}

/** Cluster colour: the longest open duration in the cluster, on the `--viz-permit-open-*` scale. */
function clusterColorExpression(): ExpressionSpecification {
  const [first, ...rest] = PERMIT_OPEN_BUCKETS;
  return [
    "step",
    ["coalesce", ["get", "maxOpenDays"], ["get", "openDays"], 0],
    resolveToken(first?.token ?? "--md-sys-color-outline"),
    ...rest.flatMap((b) => [b.minDays, resolveToken(b.token)]),
  ] as unknown as ExpressionSpecification;
}

/** Display-only ring point at `bearingDeg` from `center`, `radiusMi` away (equirectangular
 *  approximation — good enough for a visual preview; never used for the actual filter decision). */
function ringPoint(center: LatLng, bearingDeg: number, radiusMi: number): [number, number] {
  const distanceM = radiusMi * METERS_PER_MILE;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latOffsetDeg = ((distanceM * Math.cos(bearing)) / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const lngOffsetDeg =
    Math.abs(cosLat) < 1e-6
      ? 0
      : ((distanceM * Math.sin(bearing)) / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);
  return [center.lng + lngOffsetDeg, center.lat + latOffsetDeg];
}

function ringGeoJson(center: LatLng, radiusMi: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= RING_POINTS; i += 1) {
    coordinates.push(ringPoint(center, (360 * i) / RING_POINTS, radiusMi));
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

/** A roofed property shown as a Layers → "Aged roofs" marker (E-72). Only the fields the marker
 *  needs to place and color itself — never a re-derivation of `isAgedRoof`'s own threshold logic,
 *  which stays the server's/FilterSheet's job; this component only reads `roofAgeConfidence` to
 *  pick a dot shade, exactly as `data-model.md` already carries it. */
export interface RoofMarkerPoint {
  readonly propertyCid: string;
  readonly lat: number;
  readonly lng: number;
  readonly roofAgeConfidence: "high" | "medium" | "low" | "none";
  /** Published roof age, years; null when not published (the marker and hexagon say so by
   *  using the neutral "no roof age" colour, explained in the legend). */
  readonly roofAgeYears?: number | null;
}

/** A permit shown as a Layers → "Open and stalled permits" marker (E-72): coloured by
 *  `statusClass`, ringed when `isLongOpen` already flagged it ("Open > 5 yrs", never recomputed
 *  here — `packages/domain`'s `isLongOpen` is the only source, computed by the caller). */
export interface PermitMarkerPoint {
  readonly permitCid: string;
  readonly lat: number;
  readonly lng: number;
  readonly statusClass: string | null;
  readonly isLongOpen: boolean;
  /** Open duration, days (for the cluster colour); null when not published. */
  readonly openDays?: number | null;
}

export interface CrmMapLayers {
  readonly roofs: boolean;
  readonly permits: boolean;
}

export interface CrmMapHandle {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  /** Re-centres and zooms to fit `center`/`radiusMi` (the pin/GPS view), or — with no center —
   *  resets to the whole-county view (E-67's "Recentre returns to the county view"). */
  readonly recenter: () => void;
  /** From the overview, zooms in to the individual-marker view (the "Zoom in" chip). */
  readonly zoomToDetail: () => void;
}

/** `overview` = hexagons and permit clusters; `detail` = individual markers. */
export type MapViewMode = "overview" | "detail";

export interface CrmMapProps {
  readonly styleUrl?: string;
  /** The current search pin/GPS point (AC-1); `null`/`undefined` renders no pin, no ring. */
  readonly center?: LatLng | null;
  /** Statute miles, 0.5-25 (RadiusControl's own bound) — the ring's radius. */
  readonly radiusMi?: number;
  /** Fired when the map is clicked (AC-1's pin-drop). */
  readonly onPinDrop?: (point: LatLng) => void;
  /** E-72 Layers: aged-roof markers, shown when `layers.roofs` is on. */
  readonly roofMarkers?: readonly RoofMarkerPoint[];
  /** E-72 Layers: open/stalled permit markers, shown when `layers.permits` is on. */
  readonly permitMarkers?: readonly PermitMarkerPoint[];
  readonly layers?: CrmMapLayers;
  /** Fired when the view switches between the hexagon overview and individual markers. */
  readonly onViewModeChange?: (mode: MapViewMode) => void;
  /** Whole-county hexagons from `search.countyOverview`; `null`/absent = bin `roofMarkers`. */
  readonly overviewCells?: readonly HexCell[] | null;
  /** Whole-county permit cluster points (one per cell, weighted); `null`/absent = use
   *  `permitMarkers`. */
  readonly overviewPermits?: readonly OverviewPermitPoint[] | null;
  /** Fired with the whole-number zoom when it changes (the overview query's hexagon size). */
  readonly onZoomStepChange?: (zoomStep: number) => void;
}

/** A roof marker's fill: its roof age on the `--viz-roof-age-*` scale (the legend's scale). */
function roofMarkerColor(point: RoofMarkerPoint): string {
  const bucket = roofAgeBucket(point.roofAgeYears ?? null);
  return bucket === null ? "var(--md-sys-color-surface-container-highest)" : `var(${bucket.token})`;
}

/** A permit marker's fill: its open duration on the `--viz-permit-open-*` scale. */
function permitMarkerColor(point: PermitMarkerPoint): string {
  const bucket = permitOpenBucket(point.openDays ?? null);
  return bucket === null ? "var(--md-sys-color-surface-container-highest)" : `var(${bucket.token})`;
}

/** A DOM marker: a round dot (roof) or a diamond (permit, the legend's "◆"). Colours are CSS
 *  token references, so they follow dark mode with no re-render. */
function dot(color: string, ringed: boolean, shape: "round" | "diamond" = "round"): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = shape === "round" ? "50%" : "2px";
  if (shape === "diamond") el.style.transform = "rotate(45deg)";
  el.style.background = color;
  el.style.boxSizing = "border-box";
  el.style.border = ringed
    ? "3px solid var(--md-sys-color-on-surface)"
    : "2px solid var(--md-sys-color-surface)";
  // 24px hit area around the 14px visible dot (CRM-HANDOFF §10 fix 3: markers keep their 14px
  // look with a 24px hit area).
  el.style.outline = "5px solid transparent";
  return el;
}

export const CrmMap = forwardRef<CrmMapHandle, CrmMapProps>(function CrmMap(
  {
    styleUrl = DEFAULT_STYLE,
    center = null,
    radiusMi,
    onPinDrop,
    roofMarkers = [],
    permitMarkers = [],
    layers = { roofs: true, permits: true },
    onViewModeChange,
    overviewCells = null,
    overviewPermits = null,
    onZoomStepChange,
  }: CrmMapProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const radiusRef = useRef(radiusMi);
  radiusRef.current = radiusMi;
  const [styleReady, setStyleReady] = useState(false);
  const onPinDropRef = useRef(onPinDrop);
  onPinDropRef.current = onPinDrop;
  const [zoom, setZoom] = useState(COUNTY_ZOOM);
  const overview = isOverviewView(zoom, center !== null);
  const onViewModeChangeRef = useRef(onViewModeChange);
  onViewModeChangeRef.current = onViewModeChange;
  const onZoomStepChangeRef = useRef(onZoomStepChange);
  onZoomStepChangeRef.current = onZoomStepChange;

  const onRetry = useCallback(() => {
    setFailed(false);
    setRetryToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (containerRef.current === null) return;
    setStyleReady(false);

    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      zoom: COUNTY_ZOOM,
      ...buildMapInitOptions(),
    });
    mapRef.current = map;
    // Test-only hook (TD-4 fix, testplans/B-01-test-cases.md TC-002): exposes the live MapLibre
    // instance so Playwright can assert the county-bbox minZoom guarantee directly, instead of
    // only unit-testing the pure bounds math (bounds.test.ts) with no live-map assertion at all.
    // Never read by application code — only by tests/e2e/*.spec.ts.
    window.__crmMap = map;

    const applyMinZoom = (): void => {
      const minZoom = computeMinZoom(map);
      if (minZoom !== undefined) {
        map.setMinZoom(minZoom);
      }
    };

    const onError = (event: MapLibreEvent & { error?: Error }): void => {
      // MapLibre's "error" event fires for any internal failure (a malformed style, a lost
      // WebGL context, a bad minZoom call), not only a tile-load failure — treating every one
      // as CrmMapFailed390 with a "Retry" button would mislead the user for causes a reload can
      // never fix (found in code review, CR-B-01). A tile-load failure is a network fetch
      // failure, which MapLibre surfaces as a TypeError/AbortError-shaped message; anything else
      // is logged instead of shown as the named tile-failure state.
      const message = event.error?.message ?? "";
      const isTileFailure = /fetch|network|abort|load/i.test(message);
      if (isTileFailure) {
        setFailed(true);
      } else {
        console.error("MapLibre error (not a tile-load failure):", event.error);
      }
    };

    const onClick = (event: MapMouseEvent): void => {
      // A click on a permit cluster expands it (its own layer handler below) and never also
      // drops a pin there. A click on a hexagon drops the pin: with the whole county covered,
      // every county-view click lands on one, and the pin's radius fit is the zoom-in.
      if (
        map.getLayer(PERMIT_CLUSTER_LAYER_ID) !== undefined &&
        map.queryRenderedFeatures(event.point, { layers: [PERMIT_CLUSTER_LAYER_ID] }).length > 0
      ) {
        return;
      }
      onPinDropRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };

    const onLoad = (): void => {
      applyMinZoom();
      setZoom(map.getZoom());
      setStyleReady(true);
    };

    const onZoomEnd = (): void => setZoom(map.getZoom());

    const zoomInto = (lng: number, lat: number, toZoom: number): void => {
      map.easeTo({
        center: [lng, lat],
        zoom: toZoom,
        duration: prefersReducedMotion() ? 0 : 400,
      });
    };

    const onClusterClick = (
      event: MapMouseEvent & {
        features?: { properties: Record<string, unknown>; geometry: GeoJSON.Geometry }[];
      },
    ): void => {
      const feature = event.features?.[0];
      if (feature === undefined || feature.geometry.type !== "Point") return;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const clusterId = feature.properties.cluster_id;
      const source = map.getSource(PERMIT_CLUSTER_SOURCE_ID) as GeoJSONSource | undefined;
      if (typeof clusterId !== "number" || source === undefined) {
        zoomInto(lng, lat, OVERVIEW_MAX_ZOOM + 0.5);
        return;
      }
      void source
        .getClusterExpansionZoom(clusterId)
        .then((z) => zoomInto(lng, lat, Math.max(z, map.getZoom() + 1)))
        .catch(() => zoomInto(lng, lat, OVERVIEW_MAX_ZOOM + 0.5));
    };

    const pointer = (): void => {
      map.getCanvas().style.cursor = "pointer";
    };
    const unpointer = (): void => {
      map.getCanvas().style.cursor = "";
    };

    map.on("load", onLoad);
    map.on("resize", applyMinZoom);
    map.on("error", onError);
    map.on("click", onClick);
    map.on("zoomend", onZoomEnd);
    map.on("click", PERMIT_CLUSTER_LAYER_ID, onClusterClick);
    for (const id of OVERVIEW_LAYER_IDS) {
      map.on("mouseenter", id, pointer);
      map.on("mouseleave", id, unpointer);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      delete window.__crmMap;
    };
  }, [styleUrl, retryToken]);

  // The pin marker: added/moved/removed as `center` changes, never redrawn as part of the full
  // map-recreation effect above (AC-1: dropping a new pin or a new GPS fix must not re-create the
  // whole map).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    if (center === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (markerRef.current === null) {
      markerRef.current = new Marker().setLngLat([center.lng, center.lat]).addTo(map);
    } else {
      markerRef.current.setLngLat([center.lng, center.lat]);
    }
    // CRM-HANDOFF §4.2: "Picking an area, a GPS fix or a pin zooms in and draws the ring" — a
    // new centre fits the view to its ring (the radius view shows individual markers). Only on
    // a centre change: changing the radius keeps the person's own zoom.
    if (radiusRef.current !== undefined) {
      map.fitBounds(ringBounds(center, radiusRef.current), {
        padding: 32,
        duration: prefersReducedMotion() ? 0 : 400,
      });
    }
    // radiusMi is read through a ref on purpose: a radius change must not refit the view.
  }, [center?.lat, center?.lng, styleReady]);

  // The radius ring (AC-1): a GeoJSON polygon redrawn on every center/radiusMi change, per
  // plan.md's shared-rule requirement — a live client-side preview of the same search the
  // "Radius" control drives, without a server round trip just to redraw the ring.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    if (center === null || radiusMi === undefined) {
      if (map.getLayer(RADIUS_RING_FILL_LAYER_ID)) map.removeLayer(RADIUS_RING_FILL_LAYER_ID);
      if (map.getLayer(RADIUS_RING_LINE_LAYER_ID)) map.removeLayer(RADIUS_RING_LINE_LAYER_ID);
      if (map.getSource(RADIUS_RING_SOURCE_ID)) map.removeSource(RADIUS_RING_SOURCE_ID);
      return;
    }
    const data = ringGeoJson(center, radiusMi);
    const primaryColor = resolvePrimaryColor();
    const source = map.getSource(RADIUS_RING_SOURCE_ID);
    if (source !== undefined && "setData" in source) {
      (source as { setData: (data: GeoJSON.Feature) => void }).setData(data);
      // Re-resolved on every redraw (not just creation) so a dark-mode toggle between renders is
      // reflected on the next center/radius change too, not only on first paint.
      map.setPaintProperty(RADIUS_RING_FILL_LAYER_ID, "fill-color", primaryColor);
      map.setPaintProperty(RADIUS_RING_LINE_LAYER_ID, "line-color", primaryColor);
      return;
    }
    map.addSource(RADIUS_RING_SOURCE_ID, { type: "geojson", data });
    map.addLayer({
      id: RADIUS_RING_FILL_LAYER_ID,
      type: "fill",
      source: RADIUS_RING_SOURCE_ID,
      paint: { "fill-color": primaryColor, "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: RADIUS_RING_LINE_LAYER_ID,
      type: "line",
      source: RADIUS_RING_SOURCE_ID,
      paint: { "line-color": primaryColor, "line-width": 2 },
    });
  }, [center?.lat, center?.lng, radiusMi, styleReady]);

  // E-72 Layers: aged-roof markers. Re-created whenever the result set or the layer toggle
  // changes — the marker list is short (a radius search, never the whole county), so a full
  // remove/re-add is simpler and cheap enough, unlike the single pin marker above.
  const roofMarkerRefs = useRef<Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    for (const marker of roofMarkerRefs.current) marker.remove();
    roofMarkerRefs.current = [];
    if (map === null || !styleReady || !layers.roofs || overview) return;
    for (const point of roofMarkers) {
      const marker = new Marker({ element: dot(roofMarkerColor(point), false) })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      roofMarkerRefs.current.push(marker);
    }
  }, [roofMarkers, layers.roofs, styleReady, overview]);

  // E-72 Layers: open/stalled permit markers, ringed when `isLongOpen` already flagged the
  // permit ("Open > 5 yrs" — the flag itself comes from `packages/domain`'s `isLongOpen` via the
  // caller, never recomputed here).
  const permitMarkerRefs = useRef<Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    for (const marker of permitMarkerRefs.current) marker.remove();
    permitMarkerRefs.current = [];
    if (map === null || !styleReady || !layers.permits || overview) return;
    for (const point of permitMarkers) {
      const marker = new Marker({
        element: dot(permitMarkerColor(point), point.isLongOpen, "diamond"),
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      permitMarkerRefs.current.push(marker);
    }
  }, [permitMarkers, layers.permits, styleReady, overview]);

  useEffect(() => {
    onViewModeChangeRef.current?.(overview ? "overview" : "detail");
  }, [overview]);

  // Overview: the server's whole-county cells, or (fallback) the loaded roof markers binned at
  // the current whole-number zoom.
  const zoomStep = Math.floor(zoom);
  useEffect(() => {
    onZoomStepChangeRef.current?.(zoomStep);
  }, [zoomStep]);
  const hexData = useMemo(
    () =>
      hexCellsToFeatureCollection(
        overviewCells ??
          hexbin(
            roofMarkers.map((p) => ({
              lat: p.lat,
              lng: p.lng,
              roofAgeYears: p.roofAgeYears ?? null,
            })),
            { zoom: zoomStep },
          ),
      ),
    [overviewCells, roofMarkers, zoomStep],
  );
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    const show = overview && layers.roofs && hexData.features.length > 0;
    if (!show) {
      for (const id of [HEX_LINE_LAYER_ID, HEX_FILL_LAYER_ID])
        if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(HEX_SOURCE_ID)) map.removeSource(HEX_SOURCE_ID);
      return;
    }
    // At least 2, so the interpolate stops below stay strictly ascending (MapLibre rejects
    // equal stops, e.g. when every cell holds one property).
    const maxCount = Math.max(2, ...hexData.features.map((f) => f.properties.count));
    const data = hexData as unknown as GeoJSON.FeatureCollection;
    const source = map.getSource(HEX_SOURCE_ID) as GeoJSONSource | undefined;
    if (source !== undefined) {
      source.setData(data);
    } else {
      map.addSource(HEX_SOURCE_ID, { type: "geojson", data });
      map.addLayer({
        id: HEX_FILL_LAYER_ID,
        type: "fill",
        source: HEX_SOURCE_ID,
        paint: { "fill-color": hexColorExpression() },
      });
      // §10 fix 4: a 3:1 edge where fills alone fail — on-surface-variant outline.
      map.addLayer({
        id: HEX_LINE_LAYER_ID,
        type: "line",
        source: HEX_SOURCE_ID,
        paint: { "line-color": resolveToken("--md-sys-color-on-surface-variant"), "line-width": 1 },
      });
    }
    // Stronger fill = more properties in the hexagon (the legend says so).
    map.setPaintProperty(HEX_FILL_LAYER_ID, "fill-opacity", [
      "interpolate",
      ["linear"],
      ["get", "count"],
      1,
      0.45,
      maxCount,
      0.9,
    ]);
    map.setPaintProperty(HEX_FILL_LAYER_ID, "fill-color", hexColorExpression());
  }, [hexData, overview, layers.roofs, styleReady]);

  // Overview: permit count clusters (MapLibre's GeoJSON clustering), coloured by the longest
  // open duration in the cluster, sized by the summed `permits`, ringed for a 3:1 edge. Server
  // points carry a cell's permit count; a loaded permit marker counts 1.
  const permitData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features:
        overviewPermits === null
          ? permitMarkers.map((p) => ({
              type: "Feature",
              properties: { openDays: p.openDays ?? 0, permits: 1 },
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            }))
          : overviewPermits.map((p) => ({
              type: "Feature",
              properties: { openDays: p.openDays, permits: p.permits },
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            })),
    }),
    [overviewPermits, permitMarkers],
  );
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || !styleReady) return;
    const show = overview && layers.permits && permitData.features.length > 0;
    if (!show) {
      if (map.getLayer(PERMIT_CLUSTER_LAYER_ID)) map.removeLayer(PERMIT_CLUSTER_LAYER_ID);
      if (map.getSource(PERMIT_CLUSTER_SOURCE_ID)) map.removeSource(PERMIT_CLUSTER_SOURCE_ID);
      return;
    }
    const source = map.getSource(PERMIT_CLUSTER_SOURCE_ID) as GeoJSONSource | undefined;
    if (source !== undefined) {
      source.setData(permitData);
      return;
    }
    map.addSource(PERMIT_CLUSTER_SOURCE_ID, {
      type: "geojson",
      data: permitData,
      cluster: true,
      clusterRadius: 40,
      clusterMaxZoom: OVERVIEW_MAX_ZOOM,
      clusterProperties: {
        maxOpenDays: ["max", ["get", "openDays"]],
        permits: ["+", ["get", "permits"]],
      },
    });
    map.addLayer({
      id: PERMIT_CLUSTER_LAYER_ID,
      type: "circle",
      source: PERMIT_CLUSTER_SOURCE_ID,
      paint: {
        "circle-color": clusterColorExpression(),
        "circle-radius": [
          "step",
          ["coalesce", ["get", "permits"], ["get", "point_count"], 1],
          8,
          5,
          12,
          25,
          16,
          100,
          20,
        ],
        "circle-stroke-color": resolveToken("--md-sys-color-surface"),
        "circle-stroke-width": 3,
      },
    });
  }, [permitData, overview, layers.permits, styleReady]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      recenter: () => {
        const map = mapRef.current;
        if (map === null) return;
        if (center === null) {
          map.setCenter(TRAVIS_COUNTY_CENTER);
          map.setZoom(COUNTY_ZOOM);
          return;
        }
        if (radiusMi !== undefined) {
          map.fitBounds(ringBounds(center, radiusMi), {
            padding: 32,
            duration: prefersReducedMotion() ? 0 : 400,
          });
          return;
        }
        map.flyTo({ center: [center.lng, center.lat], zoom: 12 });
      },
      zoomToDetail: () => {
        const map = mapRef.current;
        if (map === null) return;
        map.easeTo({
          ...(center === null ? {} : { center: [center.lng, center.lat] as [number, number] }),
          zoom: OVERVIEW_MAX_ZOOM + 0.5,
          duration: prefersReducedMotion() ? 0 : 400,
        });
      },
    }),
    [center?.lat, center?.lng, radiusMi],
  );

  return (
    <div className={styles.wrapper}>
      <div
        ref={containerRef}
        className={styles.map}
        data-testid="crm-map"
        data-view-mode={overview ? "overview" : "detail"}
      />
      {failed && (
        <div role="alert" data-state="CrmMapFailed390" className={styles.failed}>
          <p className={styles.failedMessage}>Map tiles failed to load.</p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
});
