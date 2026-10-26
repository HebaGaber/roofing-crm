// "Why {property} is a lead" (CRM-HANDOFF §4.3, board Explore1440 `whyView`): replaces the results
// list in the results pane. Every rule the property meets with its value, source, run and CID,
// then the coordinates, and the two actions the board has: Verify CID (CountyLens's Data · Verify
// page for that CID) and Details (the property drawer). Render-only over `whyLead`.
import type { LatLng } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { CidDisplay, Icon } from "@crm/ui";
import { useEffect, useRef, type ReactElement } from "react";
import { useShellAppLinks } from "../../components/AppShell/shellApi.js";
import { candidateTitle } from "./Candidates/candidates.js";
import { whyLead } from "./whyLead.js";
import styles from "./WhyPanel.module.css";

export interface WhyPanelProps {
  readonly property: Provenanced<CrmProperty>;
  readonly permits?: readonly Provenanced<CrmPermit>[] | undefined;
  readonly center?: LatLng | undefined;
  readonly radiusMi?: number | undefined;
  readonly centreLabel?: string | undefined;
  readonly onBack: () => void;
  readonly onDetails: (propertyCid: string) => void;
}

export function WhyPanel({
  property,
  permits,
  center,
  radiusMi,
  centreLabel,
  onBack,
  onDetails,
}: WhyPanelProps): ReactElement {
  const links = useShellAppLinks();
  const ref = useRef<HTMLElement>(null);
  // The panel replaces the list, which was scrolled to the row that was opened, in a scrolling
  // sheet or pane that keeps its scroll position: scroll that container back to the top so the
  // panel's title and Back are on screen, and take focus (without the browser scrolling anything
  // else) so keyboard and screen-reader users land on it.
  useEffect(() => {
    const panel = ref.current;
    if (panel === null) return;
    panel.focus({ preventScroll: true });
    for (let el = panel.parentElement; el !== null; el = el.parentElement) {
      const overflowY = getComputedStyle(el).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
        el.scrollTop = 0;
        break;
      }
    }
  }, []);
  const countyLens = links.data?.countyLensUrl?.replace(/\/$/, "");
  const why = whyLead({ property, permits, center, radiusMi, centreLabel });
  const title = candidateTitle(property);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={styles.panel}
      aria-label={`Why ${title} is a lead`}
      data-why-panel=""
      data-property-cid={property.propertyCid}
    >
      <button type="button" className={styles.back} onClick={onBack}>
        <Icon name="arrow_back" size="medium" />
        Back to results
      </button>
      <div className={styles.head}>
        <h3 className={styles.title}>{`Why ${title} is a lead`}</h3>
        <p className={styles.sub}>Every rule, its value, the source, the run and the CID</p>
      </div>
      {why.rules.length === 0 ? (
        <p className={styles.none} data-why-empty="">
          No lead signal in the published data: no roof age, and no open or stalled roofing permit.
        </p>
      ) : (
        <ul className={styles.rules}>
          {why.rules.map((rule) => (
            <li key={rule.key} className={styles.rule} data-why-rule={rule.key}>
              <Icon name="check_circle" size="small" />
              <div className={styles.body}>
                <b>{rule.rule}</b>
                <span>{rule.value}</span>
                <span className={styles.prov}>
                  {rule.source} · <CidDisplay cid={rule.cid} />
                </span>
                {rule.link === undefined ? null : (
                  <a
                    href={rule.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-field="bbb_url"
                  >
                    {rule.link.label}
                    <span className={styles.sr}> (opens in a new tab)</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {why.coordinates === null ? (
        <p className={styles.none} data-why-coordinates="none">
          Coordinates not published for this property.
        </p>
      ) : (
        <div className={styles.rule} data-why-coordinates="">
          <Icon name="my_location" size="small" />
          <div className={styles.body}>
            <b>Coordinates</b>
            <span>{why.coordinates.text}</span>
            <span className={styles.prov}>
              {why.coordinates.source}
              {why.coordinates.direction === null ? "" : ` · ${why.coordinates.direction}`}
              {" · "}
              <a href={why.coordinates.osmUrl} target="_blank" rel="noopener noreferrer">
                Open in OpenStreetMap
                <span className={styles.sr}> (opens in a new tab)</span>
              </a>
            </span>
          </div>
        </div>
      )}
      <div className={styles.actions}>
        {countyLens === undefined ? (
          <span className={styles.unavailable} data-why-verify="unavailable">
            <Icon name="verified" size="medium" />
            Verify CID · link not available
          </span>
        ) : (
          <a
            className={styles.action}
            // Task A's Verify page takes a run manifest or a published file, not a record's own CID
            // ("is not a manifest or an artifact of any published run"), so it checks the manifest
            // this record is listed in.
            href={`${countyLens}/data/verify/${encodeURIComponent(property.sourceManifestCid)}`}
            title="Checks the run manifest this record comes from"
            target="_blank"
            rel="noopener noreferrer"
            data-why-verify=""
          >
            <Icon name="verified" size="medium" />
            Verify CID
            <span className={styles.sr}> (opens in a new tab)</span>
          </a>
        )}
        <button
          type="button"
          className={styles.action}
          onClick={() => onDetails(property.propertyCid)}
          data-why-details=""
        >
          <Icon name="info" size="medium" />
          Details
        </button>
      </div>
    </section>
  );
}
