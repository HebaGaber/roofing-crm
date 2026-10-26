// Drawer "Similar properties" (CRM-HANDOFF §4.3): up to 5 properties within 1 mile with the same
// property type and a roof age within 5 years, nearest first. Collapsed by default; the query runs
// only once the section is opened. Each row opens that property (the Map route sets `sel`).
import { useState, type ReactElement } from "react";
import { roofAgeConfidenceLabel } from "../../../format/index.js";
import { useSimilarProperties, type SimilarOutput } from "./similarApi.js";
import styles from "./PropertyDetail.module.css";

const EMPTY_REASONS: Record<NonNullable<SimilarOutput["reason"]>, string> = {
  no_coordinates: "No similar properties shown · this property has no coordinates in the data",
  no_roof_age: "No similar properties shown · this property has no roof age to compare",
  none_found:
    "No similar properties found · none within 1 mile with the same type and a roof age within 5 years",
};

function SimilarList({
  propertyCid,
  onSelectProperty,
}: {
  readonly propertyCid: string;
  readonly onSelectProperty?: ((propertyCid: string) => void) | undefined;
}): ReactElement {
  const query = useSimilarProperties(propertyCid, true);
  if (query.isPending) return <p className={styles.empty}>Loading similar properties…</p>;
  if (query.isError) {
    return (
      <p className={styles.empty} role="alert" data-similar-error="">
        Similar properties could not be loaded · try again in a moment
      </p>
    );
  }
  const { similar, reason } = query.data;
  if (similar.length === 0) {
    return (
      <p className={styles.empty} data-similar-empty={reason ?? "none_found"}>
        {EMPTY_REASONS[reason ?? "none_found"]}
      </p>
    );
  }
  return (
    <ul className={styles.metaList} data-similar-list="">
      {similar.map((row) => (
        <li key={row.propertyCid} className={styles.metaRow} data-similar-cid={row.propertyCid}>
          <span>
            {`TCAD ${row.requestIdentifier} · ${row.distanceMi.toFixed(2)} mi · roof ${String(row.roofAgeYears)} yrs (${roofAgeConfidenceLabel(row.roofAgeConfidence).toLowerCase()} confidence)`}
          </span>
          {onSelectProperty === undefined ? null : (
            <button
              type="button"
              className={styles.link}
              onClick={() => onSelectProperty(row.propertyCid)}
            >
              {`Open TCAD ${row.requestIdentifier}`}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SimilarProperties({
  propertyCid,
  titleId,
  onSelectProperty,
}: {
  readonly propertyCid: string;
  readonly titleId: string;
  readonly onSelectProperty?: ((propertyCid: string) => void) | undefined;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={styles.section}
      data-similar-properties=""
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className={styles.sectionTitle} id={`${titleId}-similar`}>
        Similar properties
      </summary>
      {open ? <SimilarList propertyCid={propertyCid} onSelectProperty={onSelectProperty} /> : null}
    </details>
  );
}
