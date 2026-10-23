// B-03 map search/context bar (CRM-HANDOFF §4.2, boards CrmMap390/1440, CrmMapPin390). A search
// field isn't wired to anything yet — address/place/permit search is B-09's agent — so this is
// the Atlas-styled bar only: a decorative search box plus the "Travis County" coverage context,
// matching the prototype's visual weight. Render-only, no state of its own.
import type { ReactElement } from "react";
import { Icon } from "@crm/ui";
import styles from "./TopBar.module.css";

export function TopBar(): ReactElement {
  return (
    <div className={styles.bar}>
      <div className={styles.search} role="search">
        <Icon name="search" size="medium" />
        <span className={styles.placeholder}>Search an address, place, ZIP or permit</span>
      </div>
      <span className={styles.county}>
        <Icon name="location_on" size="small" />
        Travis County
      </span>
    </div>
  );
}
