// B-07 T026: "Create lead" action for the property drawer (AC-1, AC-2, FR-001). Calls
// `leads.create` through leadsApi; an `ALREADY_EXISTS` error (the dedupe on
// {fips}:tcad:{request_identifier}, ADR-04) is shown as "Already a lead", not as a failure.
import { ErrorBanner } from "../../components/ErrorBanner.js";
import type { CrmProperty, Provenanced } from "@crm/index-schema";
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
 *  address (FU-A-01), so the lead is labelled by its TCAD id, never a fabricated address. */
export function toCreateInput(property: Provenanced<CrmProperty>): LeadCreateInput | null {
  if (property.latitude === null || property.longitude === null) return null;
  return {
    fips: TRAVIS_FIPS,
    requestIdentifier: property.requestIdentifier,
    address: `TCAD ${property.requestIdentifier}`,
    lat: property.latitude,
    lon: property.longitude,
    signals: {
      ...(property.roofAgeYears === null ? {} : { roofAgeYears: property.roofAgeYears }),
      roofAgeBasis: property.roofAgeBasis,
    },
    sourceManifestCid: property.sourceManifestCid,
    createdFrom: "map",
  };
}

export function LeadCreateAction({
  property,
}: {
  readonly property: Provenanced<CrmProperty>;
}): ReactElement {
  const create = useCreateLead();
  const input = toCreateInput(property);

  if (input === null) {
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
        disabled={create.isPending}
        onClick={() => create.mutate(input)}
      >
        Create lead
      </button>
    </div>
  );
}
