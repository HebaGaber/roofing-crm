// T029: adapts the copied Task A A-13 pattern (T002) to the CRM's own five roadmap sections
// (packages/shared's RoadmapSection enum) and a "Back to Map" action — makes T025 pass. Task A's
// "other county"/Explore logic is CRM-out-of-scope (this app has no county-explore route) and is
// removed, not ported (docs/reuse-log.md).
import type { ReactElement } from "react";
import { Link, useParams } from "react-router";
import { ComingSoonSkeleton } from "../components/ComingSoonSkeleton.js";
import { comingSoonItem } from "../content/coming-soon.js";
import styles from "./ComingSoon.module.css";

export function Component(): ReactElement {
  const { section } = useParams();
  const item = section === undefined ? undefined : comingSoonItem(section);

  if (item === undefined || !item.linked) {
    return (
      <section
        aria-label="Coming soon"
        data-route="coming-soon"
        data-state="not-found"
        className={styles.page}
      >
        <h2 className={styles.title}>Page not found</h2>
        <p className={styles.sentence}>There is no page at this address.</p>
        <Link to="/" className={styles.link}>
          Back to Map
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-label="Coming soon"
      data-route="coming-soon"
      data-state="ready"
      className={styles.page}
    >
      <div data-coming-soon-item={item.id} className={styles.page}>
        <span className={styles.label}>Coming soon</span>
        <h2 className={styles.title}>{item.title}</h2>
        <p className={styles.sentence} data-coming-soon-sentence="">
          {item.sentence}
        </p>
        <ComingSoonSkeleton layout={item.skeleton} />
        <Link to="/" className={styles.link}>
          Back to Map
        </Link>
      </div>
    </section>
  );
}
