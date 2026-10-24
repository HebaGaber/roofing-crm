// Map legend (CRM-HANDOFF E-72 "Legend per layer"; prototype Explore1440 `atlas-legend`): the
// roof-age scale (per hexagon in the overview, per marker when zoomed in), the permit
// open-duration scale, what the shapes mean, and — in the overview — what the hexagons cover:
// the whole county from `search.countyOverview` (design-review-log row 10), with what it leaves
// out and why and the run it read; while it loads or if it fails, says so (and, on failure, that
// the hexagons cover only the properties loaded around a pin). A collapsible <details>: open by
// default from 1280 px (where the legend has its own corner of the map), collapsed below it: open
// it covers a large part of the map and sits over the points a pin is dropped on.
import { useState, type ReactElement } from "react";
import { PERMIT_OPEN_BUCKETS, ROOF_AGE_BUCKETS } from "../../format/buckets.js";
import type { MapViewMode } from "./CrmMap.js";
import styles from "./MapLegend.module.css";

export interface MapLegendProps {
  readonly mode: MapViewMode;
  readonly roofs: boolean;
  readonly permits: boolean;
  /** Properties the current search loaded (what the fallback hexagons summarise). */
  readonly loadedCount: number;
  /** The whole-county overview's state; absent = not requested (hexagons from loaded results). */
  readonly county?: CountyOverviewStatus;
}

export type CountyOverviewStatus =
  | { readonly state: "loading" }
  | { readonly state: "error" }
  | {
      readonly state: "ready";
      readonly binned: number;
      readonly excludedNoCoordinates: number;
      readonly excludedNoRoofDate: number;
      readonly binnedWithoutRoofAge: number;
      readonly runId: string | null;
    };

const n = (value: number): string => value.toLocaleString("en-US");

function loadedNote(loadedCount: number): string {
  return loadedCount === 0
    ? "No properties loaded yet: drop a pin or use your location."
    : `Hexagons summarise the ${n(loadedCount)} properties loaded around your pin.`;
}

function CountyNote({
  county,
  loadedCount,
}: {
  readonly county: CountyOverviewStatus;
  readonly loadedCount: number;
}): ReactElement {
  if (county.state === "loading") {
    return (
      <p className={styles.note} data-overview-state="loading" role="status">
        Loading the county overview…
      </p>
    );
  }
  if (county.state === "error") {
    return (
      <p className={styles.note} data-overview-state="error" role="alert">
        The county overview could not be read. Try again shortly.
        {loadedCount > 0
          ? ` Hexagons show only the ${n(loadedCount)} properties loaded around your pin.`
          : ""}
      </p>
    );
  }
  return (
    <div className={styles.note} data-overview-state="ready">
      <p className={styles.noteLine}>
        {county.binned === 0
          ? "No properties match these filters."
          : `Hexagons cover the whole county: ${n(county.binned)} properties.`}
      </p>
      {county.excludedNoCoordinates > 0 ? (
        <p className={styles.noteLine}>
          {`${n(county.excludedNoCoordinates)} not on the map: no coordinates published.`}
        </p>
      ) : null}
      {county.excludedNoRoofDate > 0 ? (
        <p className={styles.noteLine}>
          {`${n(county.excludedNoRoofDate)} left out by the roof-age filter: no roof date published.`}
        </p>
      ) : null}
      {county.binnedWithoutRoofAge > 0 ? (
        <p className={styles.noteLine}>
          {`${n(county.binnedWithoutRoofAge)} counted but left out of the median: no roof age published.`}
        </p>
      ) : null}
      <p className={styles.noteLine} data-provenance="">
        {county.runId === null
          ? "Source: promoted index, run id not published."
          : `Source: run ${county.runId}.`}
      </p>
    </div>
  );
}

/** Token → CSS-module class holding `background: var(<token>)` (no inline styles). */
const SWATCH_CLASS: Readonly<Record<string, string>> = {
  "--viz-roof-age-0-9": "roof0",
  "--viz-roof-age-10-14": "roof10",
  "--viz-roof-age-15-19": "roof15",
  "--viz-roof-age-20-24": "roof20",
  "--viz-roof-age-25-plus": "roof25",
  "--viz-permit-open-lt-1y": "open0",
  "--viz-permit-open-1-3y": "open1",
  "--viz-permit-open-3-5y": "open3",
  "--viz-permit-open-gt-5y": "open5",
};

function startsOpen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(min-width: 1280px)").matches;
}

function Scale({
  steps,
}: {
  readonly steps: readonly { readonly token: string; readonly label: string }[];
}): ReactElement {
  return (
    <ul className={styles.scale}>
      {steps.map((step) => (
        <li key={step.token} className={styles.step}>
          <span
            className={`${styles.swatch} ${styles[SWATCH_CLASS[step.token] ?? "none"]}`}
            data-swatch={step.token}
            aria-hidden="true"
          />
          {step.label}
        </li>
      ))}
    </ul>
  );
}

export function MapLegend({
  mode,
  roofs,
  permits,
  loadedCount,
  county,
}: MapLegendProps): ReactElement | null {
  const [open, setOpen] = useState(startsOpen);
  if (!roofs && !permits) return null;
  const overview = mode === "overview";
  return (
    <details
      className={styles.legend}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      data-legend={mode}
    >
      <summary className={styles.summary}>Legend</summary>
      {roofs ? (
        <section className={styles.block}>
          <p className={styles.title}>
            {overview ? "Median roof age per hexagon, yrs" : "Roof age, yrs"}
          </p>
          <Scale steps={ROOF_AGE_BUCKETS} />
          <p className={styles.line}>
            <span
              className={`${styles.swatch} ${styles.none}`}
              data-swatch="--md-sys-color-surface-container-highest"
              aria-hidden="true"
            />
            No roof age published
          </p>
        </section>
      ) : null}
      {permits ? (
        <section className={styles.block}>
          <p className={styles.title}>
            {overview ? "Permit open, yrs · clusters" : "Permit open, yrs"}
          </p>
          <Scale steps={PERMIT_OPEN_BUCKETS} />
        </section>
      ) : null}
      <p className={styles.line}>
        {overview
          ? "Stronger hexagon fill = more properties · circle = open or stalled permits, sized by count · tap a hexagon to drop a pin there, or a circle to zoom in"
          : "● roof · ◆ open or stalled permit · dark ring = open over 5 yrs"}
      </p>
      {overview ? (
        county === undefined ? (
          <p className={styles.note}>{loadedNote(loadedCount)}</p>
        ) : (
          <CountyNote county={county} loadedCount={loadedCount} />
        )
      ) : null}
    </details>
  );
}
