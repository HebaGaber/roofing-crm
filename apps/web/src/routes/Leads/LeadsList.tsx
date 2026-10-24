// B-07 T024 / B-09 board match (CrmLeads390/768/1440, CrmLeadsFiltered1440, CrmLeadsPaged*, and the
// state boards Loading, Empty, NoMatch, Error, Partial): the paginated lead list. Consumes
// `leads.list` through leadsApi (the one shared tRPC client); filters live in the URL
// (leadFilters.state.ts) and render in LeadFilters (status, assignee, roof, permit, within; a sheet
// below 600 px). Atlas tokens and components only. Columns are the ones `leads.list` returns
// (address, status, assignee, origin, created); the board's roof, permit, contractor and last
// activity columns need the snapshot on the list rows (API gap, design/board-match/leads.md).
// States: loading, error with Retry, no leads yet, no match, partial (a lead whose property left
// the current run keeps its snapshot, AC-5), never an endless spinner.
import { Icon, StatusPill } from "@crm/ui";
import type { LeadStatus } from "@crm/shared";
import { useMemo, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router";
import { Skeleton } from "../../components/Skeleton.js";
import { LeadBanner } from "./LeadBanner.js";
import { LeadProgress } from "./LeadProgress.js";
import { LeadActions, LeadFilters, STATUS_LABEL, filterSummary } from "./LeadFilters.js";
import {
  hasActiveFilters,
  parseLeadQuery,
  patchLeadParams,
  toLeadsListInput,
  type LeadQuery,
  type LeadQueryPatch,
} from "./leadFilters.state.js";
import { leadTime, leadTimeExact, myIds, originLabel, personLabel } from "./leadFormat.js";
import { useLeadsList, type LeadListItem } from "./leadsApi.js";
import styles from "./Leads.module.css";

export const LEAD_STATUS_KIND = {
  new: "info",
  contacted: "warning",
  qualified: "verified",
  won: "verified",
  lost: "unavailable",
} as const satisfies Record<LeadStatus, "info" | "warning" | "verified" | "unavailable">;

/** The board's status icons (CrmLeads*: Contacted phone, Qualified check, New new-box). */
export const LEAD_STATUS_ICON = {
  new: "add_circle",
  contacted: "call",
  qualified: "check_circle",
  won: "emoji_events",
  lost: "cancel",
} as const satisfies Record<LeadStatus, string>;

/** True when the title is the TCAD fallback: the contract publishes no street address
 *  (design-review-log row 1), so the row says so instead of showing a made-up one. */
export function isFallbackTitle(address: string): boolean {
  return address.startsWith("TCAD ");
}

export function coordinateText(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`.replace(/-/g, "−");
}

function LeadRow({
  lead,
  mine,
}: {
  readonly lead: LeadListItem;
  readonly mine: readonly string[];
}): ReactElement {
  return (
    <li className={styles.row} data-lead-id={lead.leadId}>
      <div className={styles.cellLead}>
        <Link className={styles.cardLink} to={`/leads/${encodeURIComponent(lead.leadKey)}`}>
          {lead.address}
        </Link>
        {isFallbackTitle(lead.address) ? (
          <span className={styles.sub}>
            {`Address not published · ${coordinateText(lead.lat, lead.lon)}`}
          </span>
        ) : null}
      </div>
      <div className={styles.cellStatus}>
        <StatusPill
          status={LEAD_STATUS_KIND[lead.status]}
          text={STATUS_LABEL[lead.status]}
          icon={LEAD_STATUS_ICON[lead.status]}
        />
        {lead.notInCurrentRun ? (
          <StatusPill
            status="warning"
            text="Not in the current run · snapshot"
            icon="history"
            data={{ field: "run" }}
          />
        ) : null}
      </div>
      <div className={styles.facts}>
        <span className={styles.cell}>
          <span className={styles.srOnly}>Assignee </span>
          {personLabel(lead.assignee, mine)}
        </span>
        <span className={styles.cell}>
          <span className={styles.pre}>From </span>
          {originLabel(lead.createdFrom)}
        </span>
        <span className={styles.cell}>
          <span className={styles.pre}>Created </span>
          <time dateTime={lead.createdAt} title={leadTimeExact(lead.createdAt)}>
            {leadTime(lead.createdAt)}
          </time>
        </span>
      </div>
    </li>
  );
}

function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function Component(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const query: LeadQuery = useMemo(() => parseLeadQuery(searchParams), [searchParams]);
  const result = useLeadsList(toLeadsListInput(query));
  const patch = (next: LeadQueryPatch): void =>
    setSearchParams((prev) => patchLeadParams(prev, next));
  const mine = useMemo(() => myIds(), []);

  const filtered = hasActiveFilters(query);
  const loaded = result.status === "success" ? result.data : undefined;
  const noLeadsYet = loaded !== undefined && loaded.leads.length === 0 && !filtered;
  const noMatch = loaded !== undefined && loaded.leads.length === 0 && filtered;
  const summary = filterSummary(query);

  const head = (
    <header className={styles.head}>
      <div className={styles.headTitle}>
        <h2 id="leads-title" className={styles.title}>
          Leads
        </h2>
        <span className={styles.headCount} aria-hidden="true">
          {loaded === undefined ? "" : `· ${loaded.totalCount}`}
        </span>
      </div>
      <LeadActions query={query} />
    </header>
  );

  let body: ReactElement;
  if (result.status === "pending") {
    body = (
      <>
        <p className={styles.count}>
          <span>… leads</span>
        </p>
        <div className={styles.loadingCard} aria-busy="true">
          <LeadProgress label="Loading your leads" />
          <p className={styles.loadingText} role="status">
            Loading your leads…
          </p>
          <Skeleton variant="cards" count={3} />
        </div>
      </>
    );
  } else if (result.status === "error") {
    body = (
      <>
        <LeadBanner
          kind="error"
          icon="error"
          headline="Leads couldn't load."
          actionLabel="Retry"
          onAction={() => {
            void result.refetch();
          }}
        >
          The lead store didn't answer. Nothing was lost; your filters are kept.
        </LeadBanner>
      </>
    );
  } else if (noLeadsYet) {
    body = (
      <section className={styles.stateCard} aria-labelledby="leads-empty" role="status">
        <Icon name="contact_page" />
        <h3 id="leads-empty" className={styles.stateTitle}>
          No leads yet
        </h3>
        <p className={styles.stateBody}>
          Create your first lead from the map: find aged roofs and long-open permits, then choose
          Create lead.
        </p>
        <Link className={styles.primary} to="/">
          <Icon name="map" size="medium" />
          Go to map
        </Link>
      </section>
    );
  } else if (noMatch) {
    body = (
      <>
        <p className={styles.count}>
          <span>0 leads</span>
          {summary === null ? null : (
            <>
              <span aria-hidden="true">{" · "}</span>
              <span>{summary}</span>
            </>
          )}
        </p>
        <section className={styles.stateCard} aria-labelledby="leads-nomatch" role="status">
          <h3 id="leads-nomatch" className={styles.stateTitle}>
            No leads match these filters
          </h3>
          <p className={styles.stateBody}>
            Clear filters, or widen the radius or lower the roof age.
          </p>
          <button
            type="button"
            className={styles.tonal}
            onClick={() =>
              patch({
                roof: null,
                permit: null,
                lat: null,
                lng: null,
                r: null,
                status: null,
                assignee: null,
              })
            }
          >
            Clear filters
          </button>
        </section>
      </>
    );
  } else if (loaded !== undefined) {
    const { leads, nextCursor, totalCount } = loaded;
    const flagged = leads.filter((lead) => lead.notInCurrentRun).length;
    const first = offsetOf(query.cursor) + 1;
    const last = first + leads.length - 1;
    body = (
      <>
        <p className={styles.count}>
          <span>{`${totalCount} ${totalCount === 1 ? "lead" : "leads"}`}</span>
          <span aria-hidden="true">{" · "}</span>
          <span>{summary ?? "all mine"}</span>
        </p>
        {flagged === 0 ? null : (
          <LeadBanner kind="warning" icon="history" headline="Property not in the current run.">
            {`${flagged === 1 ? "1 lead keeps" : `${flagged} leads keep`} its snapshot. Status, notes and history are complete.`}
          </LeadBanner>
        )}
        <div className={styles.thead} aria-hidden="true">
          <span>Lead</span>
          <span>Status</span>
          <span>Assignee</span>
          <span>From</span>
          <span>Created</span>
        </div>
        <ul className={styles.list}>
          {leads.map((lead) => (
            <LeadRow key={lead.leadKey} lead={lead} mine={mine} />
          ))}
        </ul>
        <nav className={styles.pager} aria-label="Lead pages">
          <span className={styles.pagerText}>
            {totalCount <= leads.length && first === 1
              ? `Showing 1–${leads.length} of ${totalCount}`
              : `Showing ${first}–${last} of ${totalCount}`}
          </span>
          <span className={styles.pagerButtons}>
            {query.cursor === undefined ? null : (
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => patch({ cursor: null })}
              >
                First page
              </button>
            )}
            {nextCursor === undefined ? null : (
              <button
                type="button"
                className={styles.pageBtn}
                onClick={() => patch({ cursor: nextCursor })}
              >
                Next page
              </button>
            )}
          </span>
        </nav>
      </>
    );
  } else {
    body = <></>;
  }

  return (
    <section className={styles.page} aria-labelledby="leads-title">
      <LeadFilters
        query={query}
        params={searchParams}
        onPatch={patch}
        totalCount={loaded?.totalCount}
        head={head}
        noMatch={noMatch}
        hidePanel={noLeadsYet}
      />
      {body}
    </section>
  );
}
