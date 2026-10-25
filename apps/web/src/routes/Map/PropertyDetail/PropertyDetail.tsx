// B-03 property detail drawer (tasks.md T037/T038/T039; AC-6, AC-7, FR-006, FR-007). Restyled for
// the structural rebuild against CRM-HANDOFF §4.3 / boards CrmProperty390/768/1440 and
// CrmPropertyPartial390/CrmPropertyNoContractor390/CrmPropertyNoAddress390: address-or-NoAddress
// header (never a fake address — this contract has none yet, FU-A-01), Roof and Permits sections
// with their own headings, contractor "as printed" with ContractorBadge, BBB in one of its real
// states, a source link per permit and "View lineage in Explorer". Lead creation is owned by B-07 and
// added additively through `LeadCreateAction` (Leads/LeadCreateAction.tsx, B-07 T026): one for the
// property and one per permit row, both making the same lead; it also shows "Already a lead".
//
// UI fix (2026-10-25, side-by-side audit vs CrmProperty1440/390): the property's Create lead is
// full width right under the header (CRM-HANDOFF §4.3 "address and lead status on top; then
// Create lead"), with View lineage beside it; every value goes through src/format (dates as
// calendar days, enum codes and field names as plain labels). Placement (side sheet ≥ 1280 px,
// full-height sheet below) is Map.module.css's `.drawerSlot`.
import { openDurationLabel } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { IconButton, MissingReason, Provenance, StatusPill } from "@crm/ui";
import type { MissingReason as Reason } from "@crm/oracle-contract";
import { useEffect, useId, useRef, type ReactElement } from "react";
import {
  formatDate,
  humanizeCode,
  missingReasonText,
  permitStatusLabel,
  roofAgeBasisLabel,
  roofAgeConfidenceLabel,
} from "../../../format/index.js";
import { LeadCreateAction } from "../../Leads/LeadCreateAction.js";
import { ContractorBadge } from "./ContractorBadge.js";
import { MissingSummary, RowProvenance, TypePill } from "../ResultRow.js";
import styles from "./PropertyDetail.module.css";

/** `bbb_status` (contract v1.1): `rated` is never published; `blocked` means BBB blocked the lookup. */
type BbbStatus = NonNullable<CrmPermit["bbbStatus"]>;

/** The exact shape `property.get` returns (contracts/property-detail.md) — kept local rather
 *  than imported from `@crm/api-client` so this component has no hard dependency on the tRPC
 *  client package for its own Vitest/Storybook-style rendering tests. */
export interface PropertyDetailData {
  readonly property: Provenanced<CrmProperty> | null;
  readonly permits: Provenanced<CrmPermit>[];
  readonly bbbStatus: BbbStatus | null;
  readonly bbbStatusReason: string | null;
  readonly lineageUrl: string;
  /** The nearest travis-places@1.0.0 place centroid, computed server-side by `property.get`;
   *  absent when the property has no coordinates. */
  readonly nearPlace?: NearPlace;
}

/** `property.get`'s `nearPlace` (apps/api services/agent/placeResolver.ts `NearestPlace`). */
export interface NearPlace {
  readonly name: string;
  readonly distanceMi: number;
  readonly source: string;
  readonly sha256: string;
}

export interface PropertyDetailProps {
  readonly data: PropertyDetailData;
  readonly onClose: () => void;
}

/** "BBB rating not available" + the literal reason text (AC-7) — never a blank field, `0`,
 *  `N/A` or `—`, and never an invented rating (constitution P0-4). */
function BbbField({
  bbbStatus,
  bbbStatusReason,
}: {
  readonly bbbStatus: BbbStatus | null;
  readonly bbbStatusReason: string | null;
}): ReactElement {
  if (bbbStatus === null || bbbStatusReason === null) {
    return <StatusPill status="unavailable" text="BBB rating not available" />;
  }
  const reasonLabel = missingReasonText("bbb_rating", bbbStatusReason);
  return (
    <StatusPill
      status="unavailable"
      text={`BBB rating not available · ${reasonLabel}`}
      data={{ reason: bbbStatusReason }}
    />
  );
}

/** The contractor exactly as the permit prints it — unverified, never a registry identity
 *  (contract v1.1, ERR-32). When Task A published no name, the stated reason is shown (FR-003). */
function ContractorName({ permit }: { readonly permit: Provenanced<CrmPermit> }): ReactElement {
  // `!= null`, not `!== null`: until a Run 3 index is promoted the served rows are Run 2's, which
  // have no such column at all (undefined), and the drawer must not crash on them.
  if (permit.contractorNameAsPrinted != null) {
    return (
      <span data-field="contractor_name_as_printed">
        {permit.contractorNameAsPrinted} <small>(as printed, unverified)</small>
      </span>
    );
  }
  const reason =
    permit.missingReasons.find((m) => m.field === "contractor_name_as_printed")?.reason ??
    "contractor_unresolved";
  return (
    <span data-field="contractor_name_as_printed" data-reason={reason}>
      Contractor name not published · {missingReasonText("contractor_name_as_printed", reason)}
    </span>
  );
}

/** Task A builds the BBB search link from the printed name and never fetches it, so it is a
 *  search, not a rating. Only an https URL is ever rendered as a link. */
function BbbLink({ url }: { readonly url?: string | null }): ReactElement | null {
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" data-field="bbb_url">
      Search BBB for this contractor
    </a>
  );
}

function PermitDetail({
  permit,
  property,
  bbbStatus,
  bbbStatusReason,
}: {
  readonly permit: Provenanced<CrmPermit>;
  readonly property: Provenanced<CrmProperty>;
  readonly bbbStatus: BbbStatus | null;
  readonly bbbStatusReason: string | null;
}): ReactElement {
  const issued = formatDate(permit.issueDate);
  const finaled = formatDate(permit.finalDate);
  const work = [permit.improvementType, permit.improvementAction]
    .filter((w) => w !== "")
    .map(humanizeCode)
    .join(" · ");
  return (
    <article className={styles.permitCard} data-permit-cid={permit.permitCid}>
      <header className={styles.permitHead}>
        <span className={styles.permitNumber}>
          {permit.permitNumber ?? "Permit number not published"}
        </span>
        <StatusPill
          status={permit.statusClass === "open" ? "info" : "unavailable"}
          text={permitStatusLabel(permit.statusClass)}
          data={{ field: "status_class" }}
        />
      </header>
      <dl className={styles.permitFields}>
        <div className={styles.permitField}>
          <dt>Work</dt>
          <dd>{work === "" ? "Work type not published" : work}</dd>
        </div>
        <div className={styles.permitField}>
          <dt>Issued</dt>
          <dd data-field="issue_date">
            {issued ?? "Issue date not published"}
            {finaled === null ? " · not finaled" : ` · finaled ${finaled}`}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Open for</dt>
          <dd data-field="open_days">{openDurationLabel(permit.openDays)}</dd>
        </div>
        <div className={styles.permitField}>
          <dt>Contractor, as printed on permit</dt>
          <dd>
            <ContractorName permit={permit} />{" "}
            <ContractorBadge resolution={permit.contractorResolution} />
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>BBB</dt>
          <dd>
            <BbbField
              bbbStatus={permit.bbbStatus ?? bbbStatus}
              bbbStatusReason={permit.bbbStatusReason ?? bbbStatusReason}
            />{" "}
            <BbbLink url={permit.bbbUrl} />
          </dd>
        </div>
      </dl>
      <LeadCreateAction property={property} permit={permit} />
      <Provenance
        sourceUrl={null}
        capturedAt={permit.capturedAt}
        tableCid={permit.cid}
        runId={permit.runId}
      />
    </article>
  );
}

/** A null roof age with its reason from the row's own `missing` entry (P0-4). */
function RoofAgeMissing({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const entry = property.missingReasons.find(
    (m) => m.field === "roofAgeYears" || m.field === "roof_age_years",
  );
  if (entry === undefined) return <>Roof age not published (no reason recorded)</>;
  return <MissingReason field={entry.field} reason={entry.reason as Reason} />;
}

/** "near {place}" with the gazetteer as its provenance on hover. The gazetteer holds centroid
 *  points only, so the drawer never claims "in {place}". */
function NearPlaceLabel({ nearPlace }: { readonly nearPlace: NearPlace }): ReactElement {
  return (
    <span
      data-field="near_place"
      title={`Nearest place centroid, ${nearPlace.distanceMi} mi away · ${nearPlace.source} · sha256 ${nearPlace.sha256}`}
    >
      {`near ${nearPlace.name}`}
    </span>
  );
}

/** No coordinates → no place, and the row's own `missing` reason says why (P0-4). */
function NearPlaceMissing({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const entry = property.missingReasons.find((m) =>
    ["latitude", "longitude", "lat_lon"].includes(m.field),
  );
  const reason = missingReasonText(entry?.field ?? "lat_lon", entry?.reason ?? "no_coordinates");
  return (
    <span className={styles.titleSub} data-field="near_place">
      {`Nearest place not shown · ${reason}`}
    </span>
  );
}

/** One line when the property has no coordinates: it cannot be centred on the map, so the map is
 *  left alone (the same missing-data wording as the nearest place). */
function MapPositionMissing({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const entry = property.missingReasons.find((m) =>
    ["latitude", "longitude", "lat_lon"].includes(m.field),
  );
  const reason = missingReasonText(entry?.field ?? "lat_lon", entry?.reason ?? "no_coordinates");
  return (
    <span className={styles.titleSub} data-field="map_position">
      {`Not shown on the map · ${reason}`}
    </span>
  );
}

/** Drawer header (E-93): "TCAD {id} · near {place}", then "Address not published in this run ·
 *  lat, lon". */
function DrawerTitle({
  property,
  nearPlace,
}: {
  readonly property: Provenanced<CrmProperty>;
  readonly nearPlace: NearPlace | undefined;
}): ReactElement {
  const hasCoords = property.latitude !== null && property.longitude !== null;
  return (
    <span className={styles.titleStack}>
      <span>
        {`TCAD ${property.requestIdentifier}`}
        {nearPlace === undefined ? null : (
          <>
            {" · "}
            <NearPlaceLabel nearPlace={nearPlace} />
          </>
        )}
      </span>
      <span className={styles.titleSub}>
        Address not published in this run
        {property.latitude === null || property.longitude === null
          ? ""
          : ` · ${property.latitude.toFixed(5)}, ${property.longitude.toFixed(5)}`}
      </span>
      {hasCoords ? null : (
        <>
          <NearPlaceMissing property={property} />
          <MapPositionMissing property={property} />
        </>
      )}
    </span>
  );
}

export function PropertyDetail({ data, onClose }: PropertyDetailProps): ReactElement {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const propertyCid = data.property?.propertyCid ?? null;
  useEffect(() => {
    ref.current?.focus();
  }, [propertyCid]);

  if (data.property === null) {
    return (
      <aside
        ref={ref}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.drawer}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <header className={styles.drawerHead}>
          <h3 id={titleId} className={styles.drawerTitle}>
            Property not in this run
          </h3>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
      </aside>
    );
  }

  const { property } = data;
  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={styles.drawer}
      data-property-cid={property.propertyCid}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header className={styles.drawerHead}>
        <h3 id={titleId} className={styles.drawerTitle}>
          <DrawerTitle property={property} nearPlace={data.nearPlace} />
        </h3>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <div className={styles.pills}>
        <TypePill usageType={property.propertyUsageType} />
      </div>
      <div className={styles.primaryAction}>
        <LeadCreateAction property={property} permits={data.permits} />
        <a
          href={data.lineageUrl}
          className={styles.link}
          target="_blank"
          rel="noopener noreferrer"
          data-lineage-link=""
        >
          View lineage in Explorer
        </a>
      </div>

      <section className={styles.section} aria-labelledby={`${titleId}-roof`}>
        <h4 id={`${titleId}-roof`} className={styles.sectionTitle}>
          Roof
        </h4>
        <dl className={styles.permitFields}>
          <div className={styles.permitField}>
            <dt>Roof age</dt>
            <dd data-field="roof_age_years">
              {property.roofAgeYears === null ? (
                <RoofAgeMissing property={property} />
              ) : (
                `${property.roofAgeYears} yrs`
              )}
            </dd>
          </div>
          <div className={styles.permitField}>
            <dt>Basis</dt>
            <dd data-field="roof_age_basis">{roofAgeBasisLabel(property.roofAgeBasis)}</dd>
          </div>
          <div className={styles.permitField}>
            <dt>Confidence</dt>
            <dd data-field="roof_age_confidence">
              {roofAgeConfidenceLabel(property.roofAgeConfidence)}
            </dd>
          </div>
        </dl>
      </section>

      <section className={styles.section} aria-labelledby={`${titleId}-permits`}>
        <h4 id={`${titleId}-permits`} className={styles.sectionTitle}>
          {`Permits · ${data.permits.length} roofing`}
        </h4>
        {data.permits.length === 0 ? (
          <p className={styles.empty}>No roofing permits on this property.</p>
        ) : (
          <div className={styles.permitList}>
            {data.permits.map((permit) => (
              <PermitDetail
                key={permit.permitCid}
                permit={permit}
                property={property}
                bbbStatus={data.bbbStatus}
                bbbStatusReason={data.bbbStatusReason}
              />
            ))}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby={`${titleId}-missing`}>
        <h4 id={`${titleId}-missing`} className={styles.sectionTitle}>
          Not published
        </h4>
        {property.missingReasons.length === 0 ? (
          <p className={styles.empty}>Every field of this property is published in this run.</p>
        ) : (
          <MissingSummary row={property} />
        )}
      </section>
      <RowProvenance row={property} />
    </aside>
  );
}
