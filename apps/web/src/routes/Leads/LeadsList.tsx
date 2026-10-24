// B-07 T024: paginated lead list (AC-4, FR-004). Consumes `leads.list` through leadsApi (the one
// shared tRPC client), filters live in the URL (leadFilters.state.ts) and render in LeadFilters
// (status, assignee, roof, permit, within; Copy link, Show on map; a sheet below 600 px), Atlas
// tokens and components only. Created time is formatted locally (no shared `src/format` yet). States: loading skeleton, error banner with Retry, an explicit empty state (no leads yet)
// and a distinct no-match state (filters match zero) -- never an endless spinner. A lead whose
// source property left the current run is flagged, never shown as if current (AC-5).
import { StatusPill } from "@crm/ui";
import type { LeadStatus } from "@crm/shared";
import { useMemo, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router";
import { EmptyState } from "../../components/EmptyState.js";
import { ErrorBanner } from "../../components/ErrorBanner.js";
import { Skeleton } from "../../components/Skeleton.js";
import { LeadFilters, STATUS_LABEL } from "./LeadFilters.js";
import {
  hasActiveFilters,
  parseLeadQuery,
  patchLeadParams,
  toLeadsListInput,
  type LeadQueryPatch,
} from "./leadFilters.state.js";
import { useLeadsList, type LeadListItem } from "./leadsApi.js";
import styles from "./Leads.module.css";

export const LEAD_STATUS_KIND = {
  new: "info",
  contacted: "warning",
  qualified: "verified",
  won: "verified",
  lost: "unavailable",
} as const satisfies Record<LeadStatus, "info" | "warning" | "verified" | "unavailable">;

function LeadCard({ lead }: { readonly lead: LeadListItem }): ReactElement {
  return (
    <li className={styles.card} data-lead-id={lead.leadId}>
      <Link className={styles.cardLink} to={`/leads/${encodeURIComponent(lead.leadKey)}`}>
        {lead.address}
      </Link>
      <div className={styles.meta}>
        <StatusPill status={LEAD_STATUS_KIND[lead.status]} text={STATUS_LABEL[lead.status]} />
        {lead.notInCurrentRun ? (
          <StatusPill status="warning" text="Not in the current run" data={{ field: "run" }} />
        ) : null}
        <span>{`Assignee ${lead.assignee}`}</span>
        <span>{`Created ${lead.createdAt.slice(0, 16).replace("T", " ")} UTC`}</span>
      </div>
    </li>
  );
}

export function Component(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseLeadQuery(searchParams), [searchParams]);
  const result = useLeadsList(toLeadsListInput(query));
  const patch = (next: LeadQueryPatch): void =>
    setSearchParams((prev) => patchLeadParams(prev, next));

  let body: ReactElement;
  if (result.status === "pending") {
    body = <Skeleton variant="cards" />;
  } else if (result.status === "error") {
    body = (
      <ErrorBanner
        message="Leads could not be loaded."
        onRetry={() => {
          void result.refetch();
        }}
      />
    );
  } else if (result.data.leads.length === 0) {
    body = hasActiveFilters(query) ? (
      <EmptyState title="No leads match these filters">
        Try widening the radius or clearing a filter.
      </EmptyState>
    ) : (
      <EmptyState title="No leads yet">
        Open a property on the map and choose Create lead to add the first one.
      </EmptyState>
    );
  } else {
    const { leads, nextCursor, totalCount } = result.data;
    body = (
      <>
        <p className={styles.count}>{`${totalCount} ${totalCount === 1 ? "lead" : "leads"}`}</p>
        <ul className={styles.list}>
          {leads.map((lead) => (
            <LeadCard key={lead.leadKey} lead={lead} />
          ))}
        </ul>
        <nav className={styles.pager} aria-label="Lead pages">
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
        </nav>
      </>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="leads-title">
      <header className={styles.head}>
        <h2 id="leads-title" className={styles.title}>
          Leads
        </h2>
      </header>
      <LeadFilters
        query={query}
        params={searchParams}
        onPatch={patch}
        totalCount={result.status === "success" ? result.data.totalCount : undefined}
      />
      {body}
    </section>
  );
}
