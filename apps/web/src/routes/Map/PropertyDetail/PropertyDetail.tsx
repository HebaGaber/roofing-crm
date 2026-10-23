// B-03 property detail drawer (tasks.md T037/T038/T039; AC-6, AC-7, FR-006, FR-007). Replaces
// the A-13/ORACLE-u version this file was copied from (C1 copy, 2026-10-23): that version read
// Task A's place-based `ExploreRow` passed down from the parent page. This version is wired
// directly to this story's own `property.get` tRPC response (contracts/property-detail.md) — the
// status/open-duration per permit (never recomputed, `packages/domain`'s `openDurationLabel`),
// the contractor and BBB "not available" states with their real reasons (never blank, never
// invented, constitution P0-4), and the "View lineage in Explorer" link new in the CRM
// (contracts/property-detail.md step 3).
import { openDurationLabel } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { missingLabel, type MissingReason as Reason } from "@crm/oracle-contract";
import { CidDisplay, StatusPill } from "@crm/ui";
import { useEffect, useId, useRef, type ReactElement } from "react";
import { ContractorBadge } from "./ContractorBadge.js";
import { MissingSummary, PropertyFields, RowProvenance } from "../ResultRow.js";
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

function PermitDetail({ permit }: { readonly permit: Provenanced<CrmPermit> }): ReactElement {
  return (
    <div className={styles.permitSection} data-permit-cid={permit.permitCid}>
      <StatusPill
        status={permit.statusClass === "open" ? "info" : "unavailable"}
        text={permit.statusClass ?? "status not available"}
        data={{ field: "status_class" }}
      />
      <span data-field="open_days">{openDurationLabel(permit.openDays)}</span>
      <ContractorBadge resolution={permit.contractorResolution} />
    </div>
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
          <button type="button" className={styles.tab} onClick={onClose}>
            Close
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
          Property <CidDisplay cid={property.propertyCid} />
        </h3>
        <button type="button" className={styles.tab} onClick={onClose}>
          Close
        </button>
      </header>
      <PropertyFields row={property} />
      {data.permits.map((permit) => (
        <PermitDetail key={permit.permitCid} permit={permit} />
      ))}
      <BbbField bbbStatus={data.bbbStatus} bbbStatusReason={data.bbbStatusReason} />
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
