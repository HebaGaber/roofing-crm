// T022 (B-01) + T018 (B-03, US1): the home screen, gated behind the Cognito session from SignIn
// (T020). Wires pin-drop/GPS (CrmMap, GpsButton) and the radius control (RadiusControl) to
// `search.properties` (packages/api-client), rendering the zero-result "widen to {n} mi" state
// (fixed +1 mi steps, capped at 25 mi — Round 1 decision, 2026-10-23) and the outside-county
// state (AC-1's edge cases, contracts/search-api.md).
//
// Structural UI rebuild (2026-10-23, against CRM-HANDOFF §4.2/§4.3 and the served prototype
// boards — see the build report for the exact list): adds the top search/context bar, zoom and
// recentre map controls, a Layers popover (aged-roof + permit markers, coverage-gap note), the
// roof-age chip/permit-status/permit-duration filters, a "Matches N" results sheet of richer
// result cards, and a fuller property detail drawer — all layered on the SAME state machine this
// file already had (query/permitsQuery/detailQuery, the URL-state helpers, the named CrmMap*
// states). No backend call shape changed; only what renders around them.
import { useTRPC } from "@crm/api-client/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useSearchParams } from "react-router";
import { isInTravisCounty } from "../../components/Map/bounds.js";
import { CrmMap, type CrmMapHandle, type LatLng } from "../../components/Map/CrmMap.js";
import { GpsButton } from "../../components/Map/GpsButton.js";
import { LayersPopover, type LayersState } from "../../components/Map/LayersPopover.js";
import { MapControls } from "../../components/Map/MapControls.js";
import { RadiusControl } from "../../components/Map/RadiusControl.js";
import { parseMapQuery, patchMapParams, RADIUS_BOUNDS } from "./ExploreFilters.state.js";
import { FilterSheet, type PermitStatusFilter } from "./FilterSheet.js";
import { PropertyDetail, type PropertyDetailData } from "./PropertyDetail/PropertyDetail.js";
import { ResultRow } from "./ResultRow.js";
import { ResultsPanel } from "./ResultsPanel.js";
import { TopBar } from "./TopBar.js";
import styles from "./Map.module.css";

const WIDEN_STEP_MI = 1; // Round 1 decision (2026-10-23): fixed +1 mi steps, never doubling.
const [, MAX_RADIUS_MI] = RADIUS_BOUNDS;
const DEFAULT_LAYERS: LayersState = { roofs: true, permits: true, gaps: true };

export function Component(): ReactElement {
  const trpc = useTRPC();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapQuery = useMemo(() => parseMapQuery(searchParams), [searchParams]);
  const { center, radiusMi, roofAgeMinYears, permitView, sel } = mapQuery;
  // AC-1's edge case 2: a center outside Travis County is never itself the search point (the
  // pin still shows — see CrmMap's `center` prop below), so this is its own derived flag rather
  // than a URL key.
  const pinOutsideCounty = center !== null && !isInTravisCounty(center);

  const mapHandleRef = useRef<CrmMapHandle | null>(null);
  const [layers, setLayers] = useState<LayersState>(DEFAULT_LAYERS);
  const [permitStatus, setPermitStatus] = useState<PermitStatusFilter>("any");
  const [permitOpenYrs, setPermitOpenYrs] = useState<number | undefined>(undefined);

  useEffect(() => {
    // Fire-and-forget: contracts/health.md's health.ping, same-origin via the Amplify /api/*
    // rewrite. Its own X-Ray trace (not this call's result) is what AC-2/NFR-001 checks.
    void fetch("/api/trpc/health.ping").catch(() => {
      // No UI consequence: health.ping failing does not block the map (it's an observability
      // probe, not a data dependency of this screen).
    });
  }, []);

  const placePoint = useCallback(
    (point: LatLng) => {
      setSearchParams((prev) => patchMapParams(prev, { lat: point.lat, lng: point.lng }));
    },
    [setSearchParams],
  );

  const setRadiusMi = useCallback(
    (value: number) => {
      setSearchParams((prev) => patchMapParams(prev, { r: value }));
    },
    [setSearchParams],
  );

  const setRoofAgeMinYears = useCallback(
    (value: number | undefined) => {
      setSearchParams((prev) => patchMapParams(prev, { roof: value ?? null }));
    },
    [setSearchParams],
  );

  const selectProperty = useCallback(
    (propertyCid: string) => {
      setSearchParams((prev) => patchMapParams(prev, { sel: propertyCid }));
    },
    [setSearchParams],
  );

  const closeDetail = useCallback(() => {
    setSearchParams((prev) => patchMapParams(prev, { sel: null }));
  }, [setSearchParams]);

  const searchInput = useMemo(
    () => (center === null || pinOutsideCounty ? null : { center, radiusMi, roofAgeMinYears }),
    [center, pinOutsideCounty, radiusMi, roofAgeMinYears],
  );

  const query = useQuery({
    ...trpc.search.properties.queryOptions(searchInput ?? { center: { lat: 0, lng: 0 }, radiusMi }),
    enabled: searchInput !== null,
  });

  // T028 (B-03, US3): search.permits over the same radius-filtered set. Fetched whenever either
  // the permit-view toggle (results list) or the Layers popover's "permits" marker layer is on —
  // the two controls share one request, never two separately-derived ones.
  const wantPermits = permitView || layers.permits;
  const permitsQuery = useQuery({
    ...trpc.search.permits.queryOptions(
      searchInput === null
        ? { center: { lat: 0, lng: 0 }, radiusMi, sort: "openDays" as const }
        : { center: searchInput.center, radiusMi: searchInput.radiusMi, sort: "openDays" as const },
    ),
    enabled: searchInput !== null && wantPermits,
  });

  // The permit-status / permit-open-years filters (new in the structural rebuild) are applied
  // client-side — `search.permits` has no status filter of its own (contracts/search-api.md); it
  // always returns every permit in the radius, sorted by open duration.
  const filteredPermits = useMemo(() => {
    const permits = permitsQuery.data?.permits ?? [];
    return permits.filter((permit) => {
      if (permitStatus !== "any" && permit.statusClass !== permitStatus) return false;
      if (permitOpenYrs !== undefined) {
        const openYears = (permit.openDays ?? 0) / 365.25;
        if (openYears < permitOpenYrs) return false;
      }
      return true;
    });
  }, [permitsQuery.data, permitStatus, permitOpenYrs]);

  const permitsByPropertyCid = useMemo(() => {
    const map = new Map<string, typeof filteredPermits>();
    for (const permit of filteredPermits) {
      map.set(permit.propertyCid, [...(map.get(permit.propertyCid) ?? []), permit]);
    }
    return map;
  }, [filteredPermits]);

  const detailQuery = useQuery({
    ...trpc.property.get.queryOptions({ propertyCid: sel ?? "" }),
    enabled: sel !== null,
  });

  const widenTo = radiusMi + WIDEN_STEP_MI <= MAX_RADIUS_MI ? radiusMi + WIDEN_STEP_MI : null;
  const isZeroResult =
    searchInput !== null && query.data !== undefined && query.data.properties.length === 0;

  const roofMarkers = useMemo(
    () =>
      (query.data?.properties ?? [])
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => ({
          propertyCid: p.propertyCid,
          lat: p.latitude as number,
          lng: p.longitude as number,
          roofAgeConfidence: p.roofAgeConfidence,
        })),
    [query.data],
  );

  const permitMarkers = useMemo(() => {
    const properties = new Map((query.data?.properties ?? []).map((p) => [p.propertyCid, p]));
    return filteredPermits
      .map((permit) => {
        const property = properties.get(permit.propertyCid);
        if (property?.latitude == null || property.longitude == null) return null;
        return {
          permitCid: permit.permitCid,
          lat: property.latitude,
          lng: property.longitude,
          statusClass: permit.statusClass,
          isLongOpen: permit.isLongOpen,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }, [filteredPermits, query.data]);

  return (
    <section aria-label="Map" data-route="map" className={styles.page}>
      <TopBar />
      <div className={styles.controls}>
        <GpsButton onLocated={placePoint} isInCoverage={isInTravisCounty} />
        <FilterSheet
          roofAgeMinYears={roofAgeMinYears}
          onRoofAgeMinYearsChange={setRoofAgeMinYears}
          permitStatus={permitStatus}
          onPermitStatusChange={setPermitStatus}
          permitOpenYrs={permitOpenYrs}
          onPermitOpenYrsChange={setPermitOpenYrs}
        />
        <LayersPopover value={layers} onChange={setLayers} />
      </div>
      <div className={styles.mapArea}>
        <CrmMap
          ref={mapHandleRef}
          center={center}
          {...(pinOutsideCounty ? {} : { radiusMi })}
          onPinDrop={placePoint}
          roofMarkers={roofMarkers}
          permitMarkers={permitMarkers}
          layers={layers}
        />
        <MapControls mapRef={mapHandleRef} />
        {center === null ? null : (
          <div className={styles.radiusOverlay}>
            <RadiusControl radiusMi={radiusMi} onChange={setRadiusMi} originLabel="Dropped pin" />
          </div>
        )}
      </div>
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
        <ResultsPanel count={query.data.properties.length}>
          <ul className={styles.results} aria-label="Results" data-testid="search-results">
            {query.data.properties.map((property) => (
              <li key={property.propertyCid}>
                <ResultRow
                  row={property}
                  selected={sel === property.propertyCid}
                  onSelect={selectProperty}
                  {...(center === null ? {} : { center })}
                  {...(permitView
                    ? { permits: permitsByPropertyCid.get(property.propertyCid) ?? [] }
                    : {})}
                />
              </li>
            ))}
          </ul>
        </ResultsPanel>
      ) : null}
      {sel !== null && detailQuery.data !== undefined ? (
        <PropertyDetail
          data={detailQuery.data satisfies PropertyDetailData}
          onClose={closeDetail}
        />
      ) : null}
    </section>
  );
}
