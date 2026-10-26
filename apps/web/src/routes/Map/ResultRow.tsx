// B-03 result row (tasks.md T025; AC-3, FR-003). Replaces the A-13/ORACLE-u version this file was
// copied from (C1 copy, 2026-10-23): that version rendered Task A's place-based `ExploreRow`
// (address, distance/bearing, tenure, owner area class — none of which exist on this story's own
// `CrmProperty`, and ADR-03 keeps owner data out of the CRM entirely). This version renders this
// story's own fields verbatim — `roofAgeYears`/`roofAgeBasis`/`roofAgeConfidence` (never
// recomputed, data-model.md) — plus provenance (constitution XI) via the copied `@crm/ui`
// components. A missing roof age always shows its stated reason (constitution P0-4), never `0`,
// blank or `null`.
import type { LatLng } from "@crm/domain";
import { missingLabel, type MissingReason as Reason } from "@crm/oracle-contract";
import type { CrmPermit, CrmProperty, Missing, Provenanced } from "@crm/index-schema";
import { CidDisplay, Icon, MissingReason, Provenance, StatusPill, formatUtc } from "@crm/ui";
import {
  memo,
  useId,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  coordinateSourceLabel,
  groupMissing,
  missingReasonText,
  propertyKind,
  roofAgeBasisLabel,
  roofAgeConfidenceLabel,
  roofAgeGapLabel,
  roofAgeText,
} from "../../format/index.js";
import { BbbLink } from "./BbbLink.js";
import { PermitChip } from "./PermitChip.js";
import { SourceLink, safeSourceHref } from "./SourceLink.js";
import { mainPermitOf } from "./whyLead.js";
import { directionLabel, distanceFromCentre } from "./resultsView.js";
import styles from "./ResultRow.module.css";

/** The card's title: this contract never publishes a street address (§9.1/E-93 — no lexicon
 *  carrier for it yet, FU-A-01), so every row shows its TCAD account id instead of a fabricated
 *  address and never the raw lat/lon as if it were one (constitution P0-4, task brief "never raw
 *  lat/lon as a fake address"). */
export function RowTitle({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  return (
    <span className={styles.titleStack}>
      <span className={styles.titleMain}>{`TCAD ${row.requestIdentifier}`}</span>
      <span className={styles.titleSub}>Address not published in this run</span>
    </span>
  );
}

/** Distance and compass direction from the search centre ("2.8 mi NW"; AC-1: real distance via
 *  packages/domain's distanceMeters, never the display-only ring math in CrmMap.tsx). */
function RowDistance({
  row,
  center,
}: {
  readonly row: Provenanced<CrmProperty>;
  readonly center: LatLng;
}): ReactElement | null {
  const from = distanceFromCentre(center, row.latitude, row.longitude);
  if (from === null) return null;
  return (
    <span
      className={styles.distance}
      title="Straight-line distance and direction from the search centre"
    >
      {directionLabel(from)}
    </span>
  );
}

/** E-51 Residential / Commercial from the published usage type; "Type not published" when it
 *  is null (E-93). The structure form (`propertyType`, e.g. "Building") is not the design's type. */
export function TypePill({ usageType }: { readonly usageType: string | null }): ReactElement {
  const kind = propertyKind(usageType);
  if (!kind.published) {
    return <StatusPill status="unavailable" text={kind.label} icon="help" />;
  }
  return (
    <span className={styles.typePill} data-field="property_usage_type">
      <Icon name={kind.icon} size="small" />
      {kind.label}
    </span>
  );
}

/** Spread-able optional `label` (the prop is optional under exactOptionalPropertyTypes). */
const labelProp = (label: string | undefined): { label?: string } =>
  label === undefined ? {} : { label };

function RoofBadge({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  if (row.roofAgeYears === null) {
    const entry =
      row.missingReasons.find((m) => m.field === "roofAgeYears") ??
      row.missingReasons.find((m) => m.field === "roof_age_years");
    return entry === undefined ? (
      <StatusPill status="unavailable" text="Roof age not available" />
    ) : (
      <MissingReason
        field={entry.field}
        reason={entry.reason as Reason}
        {...labelProp(roofAgeGapLabel(row.propertyType, entry.reason))}
      />
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
      <StatusPill
        status={confidenceStatus}
        text={`Confidence ${roofAgeConfidenceLabel(row.roofAgeConfidence)}`}
      />
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
    return (
      <MissingReason
        field={entry.field}
        reason={entry.reason as Reason}
        {...labelProp(roofAgeGapLabel(row.propertyType, entry.reason))}
      />
    );
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
        {row.roofAgeYears === null ? (
          <RoofAgeGap row={row} />
        ) : (
          roofAgeText(row.roofAgeYears, row.roofAgeBasis)
        )}
      </Cell>
      <Cell label="Basis" field="roof_age_basis">
        {roofAgeBasisLabel(row.roofAgeBasis)}
        {row.roofAgeBasis === "built_year" && row.structureBuiltYear != null
          ? ` · Year built ${row.structureBuiltYear}`
          : ""}
      </Cell>
      <Cell label="Confidence" field="roof_age_confidence">
        {roofAgeConfidenceLabel(row.roofAgeConfidence)}
      </Cell>
      <Cell label="Coordinates" field="lat_lon">
        {row.latitude === null || row.longitude === null ? (
          <span>{coordinateSourceLabel("none")}</span>
        ) : (
          `${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)} · ${coordinateSourceLabel(row.coordinateSource)}`
        )}
      </Cell>
    </dl>
  );
}

/** The row's `missingReasons` entries, grouped by reason (constitution XI/P0-4): the fields in
 *  plain language, then the contract's reason label. The raw names stay in `data-fields`. */
/** The lead permit's contractor as printed (unverified) and its BBB state, each with the reason
 *  when empty (CRM-HANDOFF §4.3: contractor "as printed on permit", BBB in one of its states). */
function PermitSignals({
  permits,
}: {
  readonly permits: readonly Provenanced<CrmPermit>[] | undefined;
}): ReactElement | null {
  const permit = mainPermitOf(permits) ?? permits?.[0];
  if (permit === undefined) return null;
  const reason = permit.bbbStatusReason ?? "contractor_unresolved";
  return (
    <div className={styles.signals} data-permit-signals="">
      <p className={styles.signal} data-field="contractor_name_as_printed">
        {permit.contractorNameAsPrinted != null
          ? `Contractor “${permit.contractorNameAsPrinted}” as printed on permit · not verified`
          : `Contractor not published · ${missingReasonText("contractor_name_as_printed", "contractor_unresolved")}`}
      </p>
      <p className={styles.signal} data-field="bbb_status">
        {`BBB rating not available · ${missingReasonText("bbb_rating", reason)}`}
        {permit.bbbUrl == null ? null : (
          <>
            {" · "}
            <BbbLink url={permit.bbbUrl} label="Search BBB" />
          </>
        )}
      </p>
    </div>
  );
}

export function MissingSummary({
  row,
}: {
  readonly row: Pick<Provenanced<CrmProperty>, "missingReasons">;
}): ReactElement | null {
  if (row.missingReasons.length === 0) return null;
  return (
    <ul className={styles.missing} aria-label="Missing data">
      {groupMissing(row.missingReasons).map((group) => (
        <li
          key={group.reason}
          className={styles.missingGroup}
          data-missing-group={group.reason}
          data-fields={group.fields.join(",")}
        >
          <span className={styles.fieldNames}>{group.fieldsLabel}</span>
          <MissingReason field={group.fields[0] ?? ""} reason={group.reason as Reason} />
        </li>
      ))}
    </ul>
  );
}

export function RowProvenance({ row }: { readonly row: Provenanced<CrmProperty> }): ReactElement {
  if (safeSourceHref(row.sourceUrl) === null) {
    return (
      <Provenance
        sourceUrl={null}
        capturedAt={row.capturedAt}
        tableCid={row.cid}
        runId={row.runId}
      />
    );
  }
  return (
    <Provenance>
      Source: <SourceLink url={row.sourceUrl} label="source record" />
      {" · collected "}
      <time dateTime={row.capturedAt}>{formatUtc(row.capturedAt)}</time>
      {" UTC · table "}
      <CidDisplay cid={row.cid} />
      {` · run ${row.runId}`}
    </Provenance>
  );
}

export interface ResultRowProps {
  readonly row: Provenanced<CrmProperty>;
  readonly onSelect?: (propertyCid: string) => void;
  /** Opens "Why is this a lead?" for this row (the results pane shows the panel). */
  readonly onWhy?: (propertyCid: string) => void;
  readonly selected?: boolean;
  /** This property's permits (longest open first), shown as chips: the first one in the collapsed
   *  line, all of them once expanded. `undefined` or empty renders nothing: a permit is never
   *  implied for a property the permit query did not return. */
  readonly permits?: readonly Provenanced<CrmPermit>[] | undefined;
  /** The current search centre, for the card's distance and direction (AC-1). `undefined`
   *  renders no distance (no centre has been chosen yet). */
  readonly center?: LatLng | undefined;
  /** Controlled expanded state (the results panel owns it, for collapse all and expand all).
   *  Left out, the row keeps its own state and starts collapsed. */
  readonly expanded?: boolean;
  readonly onToggleExpanded?: (propertyCid: string) => void;
}

/** One result: a collapsed line (address or TCAD id, distance and direction, chips, expand) and,
 *  once expanded, the full detail card (CID, basis, confidence, coordinates, source). The detail is
 *  not rendered while collapsed, so a page of rows stays cheap to draw. */
function ResultRowView({
  row,
  onSelect,
  onWhy,
  selected = false,
  permits,
  center,
  expanded: expandedProp,
  onToggleExpanded,
}: ResultRowProps): ReactElement {
  const [ownExpanded, setOwnExpanded] = useState(false);
  const expanded = expandedProp ?? ownExpanded;
  const toggle = (): void => {
    if (onToggleExpanded !== undefined) onToggleExpanded(row.propertyCid);
    else setOwnExpanded((open) => !open);
  };
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
  const detailId = useId();
  const firstPermit = permits?.[0];
  const morePermits = (permits?.length ?? 0) - 1;
  return (
    <article
      className={`${styles.row} ${selected ? styles.selected : ""}`}
      data-result-row=""
      data-expanded={expanded ? "true" : "false"}
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
            className={styles.iconAction}
            onClick={select}
            aria-label="Open details"
            title="Open the property"
          >
            <Icon name="open_in_new" size="medium" />
          </button>
        )}
        <button
          type="button"
          className={styles.iconAction}
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          title={expanded ? "Show less" : "Show more"}
        >
          <Icon name={expanded ? "expand_less" : "expand_more"} size="medium" />
        </button>
      </header>
      <div className={styles.badgeRow}>
        <RoofBadge row={row} />
        {firstPermit === undefined ? null : (
          <ul className={styles.permits} aria-label="Permits">
            <li className={styles.permitItem}>
              <PermitChip permit={firstPermit} />
            </li>
            {morePermits > 0 ? (
              <li className={styles.permitItem}>
                <span className={styles.more}>{`+${String(morePermits)} more`}</span>
              </li>
            ) : null}
          </ul>
        )}
        <TypePill usageType={row.propertyUsageType} />
      </div>
      {expanded ? (
        <div id={detailId} className={styles.detail}>
          <p className={styles.cidLine}>
            Property <CidDisplay cid={row.propertyCid} />
          </p>
          <PropertyFields row={row} />
          <PermitSignals permits={permits} />
          {onWhy === undefined ? null : (
            <button
              type="button"
              className={styles.whyBtn}
              data-why-open=""
              onClick={() => onWhy(row.propertyCid)}
            >
              <Icon name="account_tree" size="medium" />
              Why is this a lead?
            </button>
          )}
          {permits !== undefined && permits.length > 1 ? (
            <ul className={styles.permits} aria-label="All permits">
              {permits.map((permit) => (
                <li key={permit.permitCid} className={styles.permitItem}>
                  <PermitChip permit={permit} />
                </li>
              ))}
            </ul>
          ) : null}
          <MissingSummary row={row} />
          <RowProvenance row={row} />
        </div>
      ) : null}
    </article>
  );
}

export const ResultRow = memo(ResultRowView);

// Re-exported for FilterSheet.test fixtures/other callers expecting a single wording source
// (matches the original file's intent; this story's wording is confirmed against the design
// before G7 — GAP-2, testplans/B-03-test-cases.md §10).
export const missingLabelFor = missingLabel;
