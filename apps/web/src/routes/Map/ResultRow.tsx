// B-03 result row (tasks.md T025; AC-3, FR-003). Replaces the A-13/ORACLE-u version this file was
// copied from (C1 copy, 2026-10-23): that version rendered Task A's place-based `ExploreRow`
// (address, distance/bearing, tenure, owner area class — none of which exist on this story's own
// `CrmProperty`, and ADR-03 keeps owner data out of the CRM entirely). This version renders this
// story's own fields verbatim — `roofAgeYears`/`roofAgeBasis`/`roofAgeConfidence` (never
// recomputed, data-model.md) — plus provenance (constitution XI) via the copied `@crm/ui`
// components. A missing roof age always shows its stated reason (constitution P0-4), never `0`,
// blank or `null`.
import { distanceMeters, type LatLng } from "@crm/domain";
import { missingLabel, type MissingReason as Reason } from "@crm/oracle-contract";
import type { CrmPermit, CrmProperty, Missing, Provenanced } from "@crm/index-schema";
import { CidDisplay, Icon, MissingReason, Provenance, StatusPill } from "@crm/ui";
import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from "react";
import { PermitChip } from "./PermitChip.js";
import styles from "./ResultRow.module.css";

const METERS_PER_MILE = 1609.344;

/** The card's title: this contract never publishes a street address (§9.1/E-93 — no lexicon
 *  carrier for it yet, FU-A-01), so every row shows its TCAD account id instead of a fabricated
 *  address and never the raw lat/lon as if it were one (constitution P0-4, task brief "never raw
 *  lat/lon as a fake address"). */
export function RowTitle({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  return (
    <span className={styles.titleStack}>
      <span className={styles.titleMain}>{`TCAD ${row.requestIdentifier}`}</span>
      <span className={styles.titleSub}>
        Address not published
        {row.latitude === null || row.longitude === null
          ? ""
          : ` · ${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}`}
      </span>
    </span>
  );
}

/** Distance from the search centre (AC-1: "we DO have lat/lon, so real distance via
 *  packages/domain's distanceMeters is fine" — never the display-only ring math in CrmMap.tsx). */
function RowDistance({
  row,
  center,
}: {
  readonly row: Provenanced<CrmProperty>;
  readonly center: LatLng;
}): ReactElement | null {
  if (row.latitude === null || row.longitude === null) return null;
  const miles = distanceMeters(center, { lat: row.latitude, lng: row.longitude }) / METERS_PER_MILE;
  return <span className={styles.distance}>{`${miles.toFixed(1)} mi`}</span>;
}

export function TypePill({ propertyType }: { readonly propertyType: string | null }): ReactElement {
  if (propertyType === null) {
    return <StatusPill status="unavailable" text="Type not published" />;
  }
  return (
    <span className={styles.typePill}>
      <Icon
        name={propertyType.toLowerCase() === "commercial" ? "storefront" : "home"}
        size="small"
      />
      {propertyType}
    </span>
  );
}

function RoofBadge({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  if (row.roofAgeYears === null) {
    const entry =
      row.missingReasons.find((m) => m.field === "roofAgeYears") ??
      row.missingReasons.find((m) => m.field === "roof_age_years");
    return entry === undefined ? (
      <StatusPill status="unavailable" text="Roof age not available" />
    ) : (
      <MissingReason field={entry.field} reason={entry.reason as Reason} />
    );
  }
  const confidenceStatus =
    row.roofAgeConfidence === "high"
      ? "verified"
      : row.roofAgeConfidence === "none"
        ? "unavailable"
        : "warning";
  return (
    <span className={styles.roofBadges}>
      <StatusPill status="info" text={`Roof ${row.roofAgeYears} yrs`} icon="roofing" />
      <StatusPill status={confidenceStatus} text={`Confidence ${row.roofAgeConfidence}`} />
    </span>
  );
}

function missingFor(row: Provenanced<CrmProperty>, field: string): Missing | undefined {
  return row.missingReasons.find((m) => m.field === field);
}

/** The roof-age cell's gap, using the row's own `missingReasons` entry when it has one
 *  (constitution P0-4: never a blank, never `0`, never the literal "null"). */
function RoofAgeGap({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  const entry = missingFor(row, "roofAgeYears") ?? missingFor(row, "roof_age_years");
  if (entry !== undefined) {
    return <MissingReason field={entry.field} reason={entry.reason as Reason} />;
  }
  // No missingReasons entry on this slice yet (B-03-TC-012, GAP-4b: no live row demonstrates
  // this), but roofAgeYears can still be null — show the honest fallback rather than inventing
  // a reason the row never carried.
  return <span>roof age not available</span>;
}

function Cell({
  label,
  field,
  children,
}: {
  readonly label: string;
  readonly field: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={styles.cell}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value} data-field={field}>
        {children}
      </dd>
    </div>
  );
}

export function PropertyFields({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  return (
    <dl className={styles.fields}>
      <Cell label="Roof age" field="roof_age_years">
        {row.roofAgeYears === null ? <RoofAgeGap row={row} /> : `${row.roofAgeYears} yrs`}
      </Cell>
      <Cell label="Basis" field="roof_age_basis">
        {row.roofAgeBasis}
      </Cell>
      <Cell label="Confidence" field="roof_age_confidence">
        {row.roofAgeConfidence}
      </Cell>
      <Cell label="Coordinates" field="lat_lon">
        {row.latitude === null || row.longitude === null ? (
          <span>coordinates not available</span>
        ) : (
          `${row.latitude}, ${row.longitude}`
        )}
      </Cell>
    </dl>
  );
}

/** The row's `missingReasons` entries, grouped by reason (constitution XI/P0-4). */
export function MissingSummary({
  row,
}: {
  readonly row: Provenanced<CrmProperty>;
}): ReactElement | null {
  if (row.missingReasons.length === 0) return null;
  const groups = new Map<string, string[]>();
  for (const m of row.missingReasons)
    groups.set(m.reason, [...(groups.get(m.reason) ?? []), m.field]);
  return (
    <ul className={styles.missing} aria-label="Missing data">
      {[...groups].map(([reason, fields]) => (
        <li key={reason} className={styles.missingGroup} data-missing-group={reason}>
          <code className={styles.fieldNames}>{fields.join(", ")}</code>
          <MissingReason field={fields[0] ?? ""} reason={reason as Reason} />
        </li>
      ))}
    </ul>
  );
}

export function RowProvenance({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  return (
    <Provenance sourceUrl={null} capturedAt={row.capturedAt} tableCid={row.cid} runId={row.runId} />
  );
}

export interface ResultRowProps {
  readonly row: Provenanced<CrmProperty>;
  readonly onSelect?: (propertyCid: string) => void;
  readonly selected?: boolean;
  /** B-03 permit-view (AC-5, FR-005): this property's permits, rendered via `PermitChip` when
   *  the permit-view toggle is on. `undefined`/empty renders nothing extra — permit view off
   *  never fetches or shows permits at all. */
  readonly permits?: readonly Provenanced<CrmPermit>[];
  /** The current search centre, for the card's distance line (AC-1). `undefined` renders no
   *  distance (no centre has been chosen yet). */
  readonly center?: LatLng;
}

export function ResultRow({
  row,
  onSelect,
  selected = false,
  permits,
  center,
}: ResultRowProps): ReactElement {
  const select = (): void => onSelect?.(row.propertyCid);
  const onClick = (event: MouseEvent<HTMLElement>): void => {
    if ((event.target as Element).closest("a, button") !== null) return;
    select();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };
  const titleId = `row-${row.propertyCid}`;
  return (
    <article
      className={`${styles.row} ${selected ? styles.selected : ""}`}
      data-result-row=""
      data-property-cid={row.propertyCid}
      aria-labelledby={titleId}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <header className={styles.head}>
        <h4 id={titleId} className={styles.title}>
          <RowTitle row={row} />
        </h4>
        {center === undefined ? null : <RowDistance row={row} center={center} />}
        {onSelect === undefined ? null : (
          <button
            type="button"
            className={styles.details}
            onClick={select}
            aria-label="Open details"
          >
            <Icon name="chevron_right" size="medium" />
          </button>
        )}
      </header>
      <div className={styles.badgeRow}>
        <RoofBadge row={row} />
        <TypePill propertyType={row.propertyType} />
      </div>
      <p className={styles.cidLine}>
        Property <CidDisplay cid={row.propertyCid} />
      </p>
      <PropertyFields row={row} />
      {permits !== undefined && permits.length > 0 ? (
        <ul className={styles.permits} aria-label="Permits">
          {permits.map((permit) => (
            <li key={permit.permitCid} className={styles.permitItem}>
              <PermitChip permit={permit} />
            </li>
          ))}
        </ul>
      ) : null}
      <MissingSummary row={row} />
      <RowProvenance row={row} />
    </article>
  );
}

// Re-exported for FilterSheet.test fixtures/other callers expecting a single wording source
// (matches the original file's intent; this story's wording is confirmed against the design
// before G7 — GAP-2, testplans/B-03-test-cases.md §10).
export const missingLabelFor = missingLabel;
