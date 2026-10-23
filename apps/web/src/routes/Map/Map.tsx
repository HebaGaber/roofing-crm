// T022 (B-01) + T018 (B-03, US1): the home screen, gated behind the Cognito session from SignIn
// (T020). Wires pin-drop/GPS (CrmMap, GpsButton) and the radius control (RadiusControl) to
// `search.properties` (packages/api-client), rendering the zero-result "widen to {n} mi" state
// (fixed +1 mi steps, capped at 25 mi — Round 1 decision, 2026-10-23) and the outside-county
// state (AC-1's edge cases, contracts/search-api.md).
import { useTRPC } from "@crm/api-client/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { isInTravisCounty } from "../../components/Map/bounds.js";
import { CrmMap, type LatLng } from "../../components/Map/CrmMap.js";
import { GpsButton } from "../../components/Map/GpsButton.js";
import { RadiusControl } from "../../components/Map/RadiusControl.js";
import styles from "./Map.module.css";

const DEFAULT_RADIUS_MI = 5;
const WIDEN_STEP_MI = 1; // Round 1 decision (2026-10-23): fixed +1 mi steps, never doubling.
const MAX_RADIUS_MI = 25;

export function Component(): ReactElement {
  const trpc = useTRPC();
  const [center, setCenter] = useState<LatLng | null>(null);
  const [radiusMi, setRadiusMi] = useState(DEFAULT_RADIUS_MI);
  const [pinOutsideCounty, setPinOutsideCounty] = useState(false);

  useEffect(() => {
    // Fire-and-forget: contracts/health.md's health.ping, same-origin via the Amplify /api/*
    // rewrite. Its own X-Ray trace (not this call's result) is what AC-2/NFR-001 checks.
    void fetch("/api/trpc/health.ping").catch(() => {
      // No UI consequence: health.ping failing does not block the map (it's an observability
      // probe, not a data dependency of this screen).
    });
  }, []);

  const placePoint = useCallback((point: LatLng) => {
    if (isInTravisCounty(point)) {
      setPinOutsideCounty(false);
      setCenter(point);
    } else {
      setPinOutsideCounty(true);
      setCenter(point); // kept so the pin itself still shows, per the outside-county state (TC-008)
    }
  }, []);

  const searchInput = useMemo(
    () => (center === null || pinOutsideCounty ? null : { center, radiusMi }),
    [center, pinOutsideCounty, radiusMi],
  );

  const query = useQuery({
    ...trpc.search.properties.queryOptions(searchInput ?? { center: { lat: 0, lng: 0 }, radiusMi }),
    enabled: searchInput !== null,
  });

  const widenTo = radiusMi + WIDEN_STEP_MI <= MAX_RADIUS_MI ? radiusMi + WIDEN_STEP_MI : null;
  const isZeroResult =
    searchInput !== null && query.data !== undefined && query.data.properties.length === 0;

  return (
    <section aria-label="Map" data-route="map" className={styles.page}>
      <div className={styles.controls}>
        <GpsButton onLocated={placePoint} isInCoverage={isInTravisCounty} />
        <RadiusControl radiusMi={radiusMi} onChange={setRadiusMi} />
      </div>
      <CrmMap center={center} {...(pinOutsideCounty ? {} : { radiusMi })} onPinDrop={placePoint} />
      {pinOutsideCounty ? (
        <p role="alert" data-state="CrmMapPinOutside390" className={styles.notice}>
          Pin outside Travis County
        </p>
      ) : null}
      {searchInput !== null && query.isLoading ? (
        <p
          role="progressbar"
          aria-label="Loading results"
          data-state="CrmMapLoading390"
          className={styles.notice}
        >
          Loading results…
        </p>
      ) : null}
      {searchInput !== null && query.isError ? (
        <p role="alert" data-state="CrmMapIndexDown390" className={styles.notice}>
          The index could not be read. Try again shortly.
        </p>
      ) : null}
      {isZeroResult ? (
        <p role="status" data-state="CrmMapNoResults390" className={styles.notice}>
          No properties within {radiusMi} mi.
          {widenTo === null ? null : (
            <button type="button" className={styles.widen} onClick={() => setRadiusMi(widenTo)}>
              {`Widen to ${widenTo} mi`}
            </button>
          )}
        </p>
      ) : null}
      {query.data !== undefined && query.data.properties.length > 0 ? (
        <ul className={styles.results} aria-label="Results" data-testid="search-results">
          {query.data.properties.map((property) => (
            <li
              key={property.propertyCid}
              data-result-row=""
              data-property-cid={property.propertyCid}
            >
              Property {property.propertyCid.slice(0, 12)}… — roof age{" "}
              {property.roofAgeYears ?? "not available"} yrs
              {property.roofAgeYears === null ? null : ` (${property.roofAgeBasis})`}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
