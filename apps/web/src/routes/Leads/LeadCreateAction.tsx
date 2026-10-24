// B-07 T026: "Create lead" action for the property drawer (AC-1, AC-2, FR-001). Calls
// `leads.create` through leadsApi; an `ALREADY_EXISTS` error (the dedupe on
// {fips}:tcad:{request_identifier}, ADR-04) is shown as "Already a lead", not as a failure.
import { ErrorBanner } from "../../components/ErrorBanner.js";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type { ReactElement } from "react";
import { Link } from "react-router";
import { useCreateLead, type LeadCreateInput } from "./leadsApi.js";
import styles from "./Leads.module.css";

/** Travis County, TX (the only county this CRM serves); part of the lead dedupe key. */
export const TRAVIS_FIPS = "48453";

export function isAlreadyExists(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  // `data.appCode` is set by the API's errorFormatter (tRPC does not send `cause` over the wire).
  const data = (error as { data?: { appCode?: unknown } }).data;
  return data?.appCode === "ALREADY_EXISTS";
}

/** Builds the `leads.create` input from the drawer's property. This contract publishes no street
 *  address (FU-A-01), so the lead is labelled by its TCAD id, never a fabricated address. The
 *  snapshot holds the given permit, else the property's first open one (AC-1). The contractor is
 *  left out: no permit in this slice publishes a name, and none is ever invented. */
export function toCreateInput(
  property: Provenanced<CrmProperty>,
  permits: readonly Provenanced<CrmPermit>[] = [],
  permit?: Provenanced<CrmPermit>,
): LeadCreateInput | null {
  if (property.latitude === null || property.longitude === null) return null;
  const snapshotPermit = permit ?? permits.find((p) => p.statusClass === "open");
  return {
    fips: TRAVIS_FIPS,
    requestIdentifier: property.requestIdentifier,
    address: `TCAD ${property.requestIdentifier}`,
    lat: property.latitude,
    lon: property.longitude,
    signals: {
      ...(property.roofAgeYears === null ? {} : { roofAgeYears: property.roofAgeYears }),
      roofAgeBasis: property.roofAgeBasis,
      ...(snapshotPermit?.permitNumber == null
        ? {}
        : { openPermitId: snapshotPermit.permitNumber }),
      ...(snapshotPermit?.openDays == null ? {} : { openDays: snapshotPermit.openDays }),
    },
    sourceManifestCid: property.sourceManifestCid,
    createdFrom: "map",
  };
}

export function LeadCreateAction({
  property,
  permits = [],
  permit,
}: {
  readonly property: Provenanced<CrmProperty>;
  /** The drawer's permits (the snapshot takes the first open one). */
  readonly permits?: readonly Provenanced<CrmPermit>[];
  /** Set on a permit row's button: the snapshot holds this permit. The lead is still per property. */
  readonly permit?: Provenanced<CrmPermit>;
}): ReactElement | null {
  const create = useCreateLead();
  const input = toCreateInput(property, permits, permit);

  if (input === null) {
    // The header action already says so; a permit row stays quiet.
    if (permit !== undefined) return null;
    return (
      <p className={styles.meta}>
        Create lead unavailable: this property has no published location.
      </p>
    );
  }
  if (create.isSuccess) {
    return (
      <p className={styles.createState} role="status">
        Lead created.{" "}
        <Link className={styles.link} to="/leads">
          View leads
        </Link>
      </p>
    );
  }
  if (isAlreadyExists(create.error)) {
    return (
      <p className={styles.createState} role="status">
        Already a lead.{" "}
        <Link className={styles.link} to="/leads">
          View leads
        </Link>
      </p>
    );
  }
  return (
    <div className={styles.createState}>
      {create.error === null || create.error === undefined ? null : (
        <ErrorBanner message="Lead could not be created. Try again." />
      )}
      <button
        type="button"
        className={styles.action}
        aria-label={
          permit === undefined
            ? undefined
            : `Create lead from permit ${permit.permitNumber ?? "(number not published)"}`
        }
        disabled={create.isPending}
        onClick={() => create.mutate(input)}
      >
        {permit === undefined ? "Create lead" : "Create lead from permit"}
      </button>
    </div>
  );
}
