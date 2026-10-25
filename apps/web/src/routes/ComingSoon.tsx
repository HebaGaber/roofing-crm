// T029: adapts the copied Task A A-13 pattern (T002) to the CRM's own five roadmap sections
// (packages/shared's RoadmapSection enum) and a "Back to Map" action — makes T025 pass. Task A's
// "other county"/Explore logic is CRM-out-of-scope (this app has no county-explore route) and is
// removed, not ported (docs/reuse-log.md).
// Layout follows the CRM boards CrmComingSoon390/768/1440: a centred card "{Section} is coming
// soon", its purpose and "planned for the Roofing CRM but not part of this release", a
// provenance line and a filled Back to Map button (no skeleton: the boards draw none). The
// purpose lines are the nav tooltips of design/docs/CRM-HANDOFF.md "Coming-soon items".
import type { ReactElement } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../components/Icon.js";
import { comingSoonItem } from "../content/coming-soon.js";
import styles from "./ComingSoon.module.css";

const PURPOSE: Readonly<Record<string, string>> = {
  campaigns: "Plan outreach to groups of leads.",
  estimates: "Price a roof from the lead.",
  jobs: "Schedule and track roofing work.",
  invoices: "Bill completed jobs.",
  outreach: "Email and SMS to owners.",
};

const PLANNED =
  "It is planned for the Roofing CRM but not part of this release, so there is nothing to open yet.";
const LIVE_SECTIONS = "Roofing CRM · Map, Filters and AI search, plus leads";

interface CardProps {
  readonly state: "ready" | "not-found";
  readonly label: string;
  readonly itemId?: string;
  readonly title: string;
  readonly body: string;
  readonly provenance: string;
}

function ComingSoonCard({
  state,
  label,
  itemId,
  title,
  body,
  provenance,
}: CardProps): ReactElement {
  return (
    <section aria-label={label} data-route="coming-soon" data-state={state} className={styles.page}>
      <div data-coming-soon-item={itemId} className={styles.card}>
        <span className={styles.icon}>
          <Icon name="schedule" />
        </span>
        <h2 id="coming-soon-title" className={styles.title}>
          {title}
        </h2>
        <p id="coming-soon-body" className={styles.body} data-coming-soon-sentence="">
          {body}
        </p>
        <p className={styles.provenance}>
          <Icon name="info" size="small" />
          <span>{provenance}</span>
        </p>
        <div className={styles.actions}>
          <Link to="/" className={styles.button} data-variant="filled">
            <Icon name="map" size="medium" />
            Back to Map
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Component(): ReactElement {
  const { section } = useParams();
  const item = section === undefined ? undefined : comingSoonItem(section);

  if (item === undefined || !item.linked) {
    return (
      <ComingSoonCard
        state="not-found"
        label="Section not found"
        title="There’s no section here"
        body="This link doesn’t match a CRM section. The live sections are Map and Leads."
        provenance={`Roofing CRM · unknown section “${String(section ?? "").slice(0, 24)}”`}
      />
    );
  }

  return (
    <ComingSoonCard
      state="ready"
      label={`${item.title} (coming soon)`}
      itemId={item.id}
      title={`${item.title} is coming soon`}
      body={`${PURPOSE[item.id] ?? item.sentence} ${PLANNED}`}
      provenance={LIVE_SECTIONS}
    />
  );
}
