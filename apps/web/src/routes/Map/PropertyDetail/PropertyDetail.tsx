// B-03 property detail drawer (tasks.md T037/T038/T039; AC-6, AC-7, FR-006, FR-007). Restyled for
// the structural rebuild against CRM-HANDOFF §4.3 / boards CrmProperty390/768/1440 and
// CrmPropertyPartial390/CrmPropertyNoContractor390/CrmPropertyNoAddress390: address-or-NoAddress
// header (never a fake address — this contract has none yet, FU-A-01), Roof and Permits sections
// with their own headings, contractor "as printed" with ContractorBadge, BBB in one of its real
// states, a source link per permit and "View lineage in Explorer". Deliberately does NOT include
// a "Create lead" button, "Already a lead" state, or "Create lead from this permit" — B-07 owns
// all lead creation (story's Out of scope); this drawer renders nothing in that slot rather than
// a disabled placeholder that implies unbuilt functionality.
import { openDurationLabel } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { missingLabel, type MissingReason as Reason } from "@crm/oracle-contract";
import { Provenance, StatusPill } from "@crm/ui";
import { useEffect, useId, useRef, type ReactElement } from "react";
import { ContractorBadge } from "./ContractorBadge.js";
import { MissingSummary, RowProvenance, RowTitle, TypePill } from "../ResultRow.js";
import styles from "./PropertyDetail.module.css";

/** The exact shape `property.get` returns (contracts/property-detail.md) — kept local rather
 *  than imported from `@crm/api-client` so this component has no hard dependency on the tRPC
 *  client package for its own Vitest/Storybook-style rendering tests. */
export interface PropertyDetailData {
  readonly property: Provenanced<CrmProperty> | null;
  readonly permits: Provenanced<CrmPermit>[];
  readonly bbbStatus: "not_checked" | null;
  readonly bbbStatusReason: string | null;
  readonly lineageUrl: string;
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
  readonly bbbStatus: "not_checked" | null;
  readonly bbbStatusReason: string | null;
}): ReactElement {
  if (bbbStatus === null || bbbStatusReason === null) {
    return <StatusPill status="unavailable" text="BBB rating not available" />;
  }
  const reasonLabel = ((): string => {
    try {
      return missingLabel("bbb_rating", bbbStatusReason as Reason);
    } catch {
      return bbbStatusReason;
    }
  })();
  return (
    <StatusPill
      status="unavailable"
      text={`BBB rating not available · ${reasonLabel}`}
      data={{ reason: bbbStatusReason }}
    />
  );
}

function PermitDetail({
  permit,
  bbbStatus,
  bbbStatusReason,
}: {
  readonly permit: Provenanced<CrmPermit>;
  readonly bbbStatus: "not_checked" | null;
  readonly bbbStatusReason: string | null;
}): ReactElement {
  const isStalled = permit.statusClass !== "open";
  return (
    <article className={styles.permitCard} data-permit-cid={permit.permitCid}>
      <header className={styles.permitHead}>
        <span className={styles.permitNumber}>
          {permit.permitNumber ?? "Permit number not published"}
        </span>
        <StatusPill
          status={permit.statusClass === "open" ? "info" : "unavailable"}
          text={
            isStalled
              ? "Stalled · derived: no status in source"
              : (permit.statusClass ?? "status not available")
          }
          data={{ field: "status_class" }}
        />
      </header>
      <dl className={styles.permitFields}>
        <div className={styles.permitField}>
          <dt>Work</dt>
          <dd>{permit.improvementType || permit.improvementAction || "not published"}</dd>
        </div>
        <div className={styles.permitField}>
          <dt>Issued</dt>
          <dd>
            {permit.issueDate ?? "not published"}
            {permit.finalDate === null ? " · not finaled" : ` · finaled ${permit.finalDate}`}
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>Open for</dt>
          <dd data-field="open_days">{openDurationLabel(permit.openDays)}</dd>
        </div>
        <div className={styles.permitField}>
          <dt>Contractor, as printed on permit</dt>
          <dd>
            <ContractorBadge resolution={permit.contractorResolution} />
          </dd>
        </div>
        <div className={styles.permitField}>
          <dt>BBB</dt>
          <dd>
            <BbbField bbbStatus={bbbStatus} bbbStatusReason={bbbStatusReason} />
          </dd>
        </div>
      </dl>
      <Provenance
        sourceUrl={null}
        capturedAt={permit.capturedAt}
        tableCid={permit.cid}
        runId={permit.runId}
      />
    </article>
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
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
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
          <RowTitle row={property} />
        </h3>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <TypePill propertyType={property.propertyType} />

      <section className={styles.section} aria-labelledby={`${titleId}-roof`}>
        <h4 id={`${titleId}-roof`} className={styles.sectionTitle}>
          Roof
        </h4>
        <dl className={styles.permitFields}>
          <div className={styles.permitField}>
            <dt>Roof age</dt>
            <dd data-field="roof_age_years">
              {property.roofAgeYears === null ? "not available" : `${property.roofAgeYears} yrs`}
            </dd>
          </div>
          <div className={styles.permitField}>
            <dt>Basis</dt>
            <dd data-field="roof_age_basis">{property.roofAgeBasis}</dd>
          </div>
          <div className={styles.permitField}>
            <dt>Confidence</dt>
            <dd data-field="roof_age_confidence">{property.roofAgeConfidence}</dd>
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
                bbbStatus={data.bbbStatus}
                bbbStatusReason={data.bbbStatusReason}
              />
            ))}
          </div>
        )}
      </section>

      <a
        href={data.lineageUrl}
        className={styles.link}
        target="_blank"
        rel="noopener noreferrer"
        data-lineage-link=""
      >
        View lineage in Explorer
      </a>
      <MissingSummary row={property} />
      <RowProvenance row={property} />
    </aside>
  );
}
