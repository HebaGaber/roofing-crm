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
import { Map as MapLibreMap, Marker, type MapLibreEvent, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { buildMapInitOptions, computeMinZoom, TRAVIS_COUNTY_CENTER } from "./bounds.js";
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
/** Hardcoding Atlas's light-mode primary hex here would never follow dark mode like every other
 *  primary-colored element (constitution: "UI uses only Atlas tokens") — MapLibre paint
 *  properties need a literal value, not a CSS var string, so the live `--md-sys-color-primary`
 *  is resolved from the DOM at the point the layer is created/updated instead (found in review,
 *  CR-B-03). Falls back to the light-mode hex only if the token is somehow unset. */
const FALLBACK_PRIMARY_COLOR = "#0B57D0";

function resolvePrimaryColor(): string {
  if (typeof document === "undefined") return FALLBACK_PRIMARY_COLOR;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--md-sys-color-primary")
    .trim();
  return value === "" ? FALLBACK_PRIMARY_COLOR : value;
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
}

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
}

const ROOF_MARKER_COLOR: Readonly<Record<RoofMarkerPoint["roofAgeConfidence"], string>> = {
  high: "#B3261E",
  medium: "#E8730A",
  low: "#8E6A00",
  none: "#747775",
};

const PERMIT_MARKER_COLOR: Readonly<Record<string, string>> = {
  open: "#0B57D0",
  stalled: "#8E6A00",
};

function dot(color: string, ringed: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = "50%";
  el.style.background = color;
  el.style.boxSizing = "border-box";
  el.style.border = ringed ? "3px solid #000" : "2px solid #fff";
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
  }: CrmMapProps,
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [styleReady, setStyleReady] = useState(false);
  const onPinDropRef = useRef(onPinDrop);
  onPinDropRef.current = onPinDrop;

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
      zoom: 9,
      ...buildMapInitOptions(),
    });
    mapRef.current = map;
    // Test-only hook (TD-4 fix, testplans/B-01-test-cases.md TC-002): exposes the live MapLibre
    // instance so Playwright can assert the county-bbox minZoom guarantee directly, instead of
    // only unit-testing the pure bounds math (bounds.test.ts) with no live-map assertion at all.
    // Never read by application code — only by tests/e2e/*.spec.ts.
    (window as unknown as { __crmMap?: MapLibreMap }).__crmMap = map;

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
      onPinDropRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };

    const onLoad = (): void => {
      applyMinZoom();
      setStyleReady(true);
    };

    map.on("load", onLoad);
    map.on("resize", applyMinZoom);
    map.on("error", onError);
    map.on("click", onClick);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      delete (window as unknown as { __crmMap?: MapLibreMap }).__crmMap;
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
    if (map === null || !styleReady || !layers.roofs) return;
    for (const point of roofMarkers) {
      const marker = new Marker({ element: dot(ROOF_MARKER_COLOR[point.roofAgeConfidence], false) })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      roofMarkerRefs.current.push(marker);
    }
  }, [roofMarkers, layers.roofs, styleReady]);

  // E-72 Layers: open/stalled permit markers, ringed when `isLongOpen` already flagged the
  // permit ("Open > 5 yrs" — the flag itself comes from `packages/domain`'s `isLongOpen` via the
  // caller, never recomputed here).
  const permitMarkerRefs = useRef<Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    for (const marker of permitMarkerRefs.current) marker.remove();
    permitMarkerRefs.current = [];
    if (map === null || !styleReady || !layers.permits) return;
    for (const point of permitMarkers) {
      const color = PERMIT_MARKER_COLOR[point.statusClass ?? ""] ?? "#747775";
      const marker = new Marker({ element: dot(color, point.isLongOpen) })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      permitMarkerRefs.current.push(marker);
    }
  }, [permitMarkers, layers.permits, styleReady]);

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
          map.setZoom(9);
          return;
        }
        map.flyTo({ center: [center.lng, center.lat], zoom: 12 });
      },
    }),
    [center?.lat, center?.lng],
  );

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.map} data-testid="crm-map" />
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
