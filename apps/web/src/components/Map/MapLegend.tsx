// Map legend (CRM-HANDOFF E-72 "Legend per layer"; prototype Explore1440 `atlas-legend`): the
// roof-age scale (per hexagon in the overview, per marker when zoomed in), the permit
// open-duration scale, what the shapes mean, and — in the overview — what the hexagons cover:
// only the properties loaded around the pin, because the search API publishes no county-wide
// aggregate yet (design-review-log row 10's `search.countyOverview` was never built). A
// collapsible <details>: open by default from 600 px, collapsed on compact screens.
import { useState, type ReactElement } from "react";
import { PERMIT_OPEN_BUCKETS, ROOF_AGE_BUCKETS } from "../../format/buckets.js";
import type { MapViewMode } from "./CrmMap.js";
import styles from "./MapLegend.module.css";

export interface MapLegendProps {
  readonly mode: MapViewMode;
  readonly roofs: boolean;
  readonly permits: boolean;
  /** Properties the current search loaded (what the hexagons summarise). */
  readonly loadedCount: number;
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
  return window.matchMedia("(min-width: 600px)").matches;
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
          ? "Stronger hexagon fill = more properties · circle = permit cluster, sized by count · select either to zoom in"
          : "● roof · ◆ open or stalled permit · dark ring = open over 5 yrs"}
      </p>
      {overview ? (
        <p className={styles.note}>
          {loadedCount === 0
            ? "No properties loaded yet: drop a pin or use your location. "
            : `Hexagons summarise the ${loadedCount} properties loaded around your pin. `}
          A county-wide overview is not published by the search API yet.
        </p>
      ) : null}
    </details>
  );
}
