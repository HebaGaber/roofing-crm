// T021: MapLibre wrapper. center is fixed on Travis County (bounds.ts); minZoom is derived once
// via map.cameraForBounds on load/resize, no maxBounds set (research.md). On a tile-load failure,
// renders the named CrmMapFailed390 state with a "Retry" action — never a blank grey grid
// (TC-007, the spec.md edge case closed at G5).
import { Map as MapLibreMap, type MapLibreEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { buildMapInitOptions, computeMinZoom } from "./bounds.js";
import styles from "./CrmMap.module.css";

/** Default demo style: no API key required (maplibre demotiles); swap for a provider style later. */
const DEFAULT_STYLE = "https://demotiles.maplibre.org/style.json";

export interface CrmMapProps {
  readonly styleUrl?: string;
}

export function CrmMap({ styleUrl = DEFAULT_STYLE }: CrmMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const onRetry = useCallback(() => {
    setFailed(false);
    setRetryToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (containerRef.current === null) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      zoom: 9,
      ...buildMapInitOptions(),
    });
    mapRef.current = map;

    const applyMinZoom = (): void => {
      const minZoom = computeMinZoom(map);
      if (minZoom !== undefined) {
        map.setMinZoom(minZoom);
      }
    };

    const onError = (_event: MapLibreEvent & { error?: Error }): void => {
      setFailed(true);
    };

    map.on("load", applyMinZoom);
    map.on("resize", applyMinZoom);
    map.on("error", onError);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl, retryToken]);

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
