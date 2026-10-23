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
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { buildMapInitOptions, computeMinZoom } from "./bounds.js";
import styles from "./CrmMap.module.css";

/** Default demo style: no API key required (maplibre demotiles); swap for a provider style later. */
const DEFAULT_STYLE = "https://demotiles.maplibre.org/style.json";

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

export interface CrmMapProps {
  readonly styleUrl?: string;
  /** The current search pin/GPS point (AC-1); `null`/`undefined` renders no pin, no ring. */
  readonly center?: LatLng | null;
  /** Statute miles, 0.5-25 (RadiusControl's own bound) — the ring's radius. */
  readonly radiusMi?: number;
  /** Fired when the map is clicked (AC-1's pin-drop). */
  readonly onPinDrop?: (point: LatLng) => void;
}

export function CrmMap({
  styleUrl = DEFAULT_STYLE,
  center = null,
  radiusMi,
  onPinDrop,
}: CrmMapProps): ReactElement {
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
    const source = map.getSource(RADIUS_RING_SOURCE_ID);
    if (source !== undefined && "setData" in source) {
      (source as { setData: (data: GeoJSON.Feature) => void }).setData(data);
      return;
    }
    map.addSource(RADIUS_RING_SOURCE_ID, { type: "geojson", data });
    map.addLayer({
      id: RADIUS_RING_FILL_LAYER_ID,
      type: "fill",
      source: RADIUS_RING_SOURCE_ID,
      paint: { "fill-color": "#0B57D0", "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: RADIUS_RING_LINE_LAYER_ID,
      type: "line",
      source: RADIUS_RING_SOURCE_ID,
      paint: { "line-color": "#0B57D0", "line-width": 2 },
    });
  }, [center?.lat, center?.lng, radiusMi, styleReady]);

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
}
