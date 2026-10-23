// T022 (B-01) + T018 (B-03, US1): the home screen, gated behind the Cognito session from SignIn
// (T020). Wires pin-drop/GPS (CrmMap, GpsButton) and the radius control (RadiusControl) to
// `search.properties` (packages/api-client), rendering the zero-result "widen to {n} mi" state
// (fixed +1 mi steps, capped at 25 mi — Round 1 decision, 2026-10-23) and the outside-county
// state (AC-1's edge cases, contracts/search-api.md).
//
// Fixer pass (CR-B-03, 2026-10-23): this file now actually renders the components the story
// built instead of a hand-rolled `<li>` list — `FilterSheet` (roof-age threshold + permit-view
// toggle), `ResultRow` (each result, with `PermitChip` wired in via its `permits` prop when
// permit view is on), and `PropertyDetail` (opened in a drawer on row click, reading
// `property.get`). `ExploreFilters.state.ts`'s URL-state helpers now actually drive the URL via
// react-router's `useSearchParams` (lat/lng/r/roof/permits/sel), making the search shareable and
// restorable as plan.md always required.
import { useTRPC } from "@crm/api-client/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, type ReactElement } from "react";
import { useSearchParams } from "react-router";
import { isInTravisCounty } from "../../components/Map/bounds.js";
import { CrmMap, type LatLng } from "../../components/Map/CrmMap.js";
import { GpsButton } from "../../components/Map/GpsButton.js";
import { RadiusControl } from "../../components/Map/RadiusControl.js";
import { parseMapQuery, patchMapParams, RADIUS_BOUNDS } from "./ExploreFilters.state.js";
import { FilterSheet } from "./FilterSheet.js";
import { PropertyDetail, type PropertyDetailData } from "./PropertyDetail/PropertyDetail.js";
import { ResultRow } from "./ResultRow.js";
import styles from "./Map.module.css";

const WIDEN_STEP_MI = 1; // Round 1 decision (2026-10-23): fixed +1 mi steps, never doubling.
const [, MAX_RADIUS_MI] = RADIUS_BOUNDS;

export function Component(): ReactElement {
  const trpc = useTRPC();
  const [searchParams, setSearchParams] = useSearchParams();
  const mapQuery = useMemo(() => parseMapQuery(searchParams), [searchParams]);
  const { center, radiusMi, roofAgeMinYears, permitView, sel } = mapQuery;
  // AC-1's edge case 2: a center outside Travis County is never itself the search point (the
  // pin still shows — see CrmMap's `center` prop below), so this is its own derived flag rather
  // than a URL key.
  const pinOutsideCounty = center !== null && !isInTravisCounty(center);

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

  const setPermitView = useCallback(
    (value: boolean) => {
      setSearchParams((prev) => patchMapParams(prev, { permits: value }));
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

  // T028 (B-03, US3): search.permits over the same radius-filtered set, only ever fetched when
  // the permit-view toggle is on (FR-005) — permit view off never issues this request at all.
  const permitsQuery = useQuery({
    ...trpc.search.permits.queryOptions(
      searchInput === null
        ? { center: { lat: 0, lng: 0 }, radiusMi, sort: "openDays" as const }
        : { center: searchInput.center, radiusMi: searchInput.radiusMi, sort: "openDays" as const },
    ),
    enabled: searchInput !== null && permitView,
  });

  const permitsByPropertyCid = useMemo(() => {
    const map = new Map<string, NonNullable<typeof permitsQuery.data>["permits"]>();
    if (permitsQuery.data === undefined) return map;
    for (const permit of permitsQuery.data.permits) {
      map.set(permit.propertyCid, [...(map.get(permit.propertyCid) ?? []), permit]);
    }
    return map;
  }, [permitsQuery.data]);

  const detailQuery = useQuery({
    ...trpc.property.get.queryOptions({ propertyCid: sel ?? "" }),
    enabled: sel !== null,
  });

  const widenTo = radiusMi + WIDEN_STEP_MI <= MAX_RADIUS_MI ? radiusMi + WIDEN_STEP_MI : null;
  const isZeroResult =
    searchInput !== null && query.data !== undefined && query.data.properties.length === 0;

  return (
    <section aria-label="Map" data-route="map" className={styles.page}>
      <div className={styles.controls}>
        <GpsButton onLocated={placePoint} isInCoverage={isInTravisCounty} />
        <RadiusControl radiusMi={radiusMi} onChange={setRadiusMi} />
        <FilterSheet
          roofAgeMinYears={roofAgeMinYears}
          permitView={permitView}
          onRoofAgeMinYearsChange={setRoofAgeMinYears}
          onPermitViewChange={setPermitView}
        />
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
            <li key={property.propertyCid}>
              <ResultRow
                row={property}
                selected={sel === property.propertyCid}
                onSelect={selectProperty}
                {...(permitView
                  ? { permits: permitsByPropertyCid.get(property.propertyCid) ?? [] }
                  : {})}
              />
            </li>
          ))}
        </ul>
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
