// B-07 T024: paginated lead list (AC-4, FR-004). Consumes `leads.list` through leadsApi (the one
// shared tRPC client), filters live in the URL (leadFilters.state.ts), Atlas tokens and components
// only. States: loading skeleton, error banner with Retry, an explicit empty state (no leads yet)
// and a distinct no-match state (filters match zero) -- never an endless spinner. A lead whose
// source property left the current run is flagged, never shown as if current (AC-5).
import { StatusPill } from "@crm/ui";
import { LEAD_STATUSES, type LeadStatus } from "@crm/shared";
import { useMemo, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router";
import { EmptyState } from "../../components/EmptyState.js";
import { ErrorBanner } from "../../components/ErrorBanner.js";
import { Skeleton } from "../../components/Skeleton.js";
import { ROOF_AGE_CHIPS } from "../Map/FilterSheet.js";
import filterStyles from "../Map/FilterSheet.module.css";
import {
  PERMIT_STATUSES,
  hasActiveFilters,
  parseLeadQuery,
  patchLeadParams,
  toLeadsListInput,
  type LeadQuery,
  type LeadQueryPatch,
} from "./leadFilters.state.js";
import { useLeadsList, type LeadListItem } from "./leadsApi.js";
import styles from "./Leads.module.css";

const STATUS_LABEL: Readonly<Record<LeadStatus, string>> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export const LEAD_STATUS_KIND = {
  new: "info",
  contacted: "warning",
  qualified: "verified",
  won: "verified",
  lost: "unavailable",
} as const satisfies Record<LeadStatus, "info" | "warning" | "verified" | "unavailable">;

function Filters({
  query,
  onPatch,
}: {
  readonly query: LeadQuery;
  readonly onPatch: (patch: LeadQueryPatch) => void;
}): ReactElement {
  return (
    <section className={styles.filters} aria-label="Lead filters">
      <div className={filterStyles.group}>
        <span className={filterStyles.groupLabel}>Roof age ≥</span>
        <div className={filterStyles.chips} role="group" aria-label="Roof age threshold">
          {ROOF_AGE_CHIPS.map((years) => (
            <button
              key={years}
              type="button"
              className={`${filterStyles.chip} ${
                query.roofAgeMinYears === years ? filterStyles.chipSelected : ""
              }`}
              aria-pressed={query.roofAgeMinYears === years}
              onClick={() => onPatch({ roof: query.roofAgeMinYears === years ? null : years })}
            >
              {years}
            </button>
          ))}
        </div>
      </div>
      <div className={filterStyles.group}>
        <span className={filterStyles.groupLabel}>Permit status</span>
        <div className={filterStyles.chips} role="group" aria-label="Permit status">
          {PERMIT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={`${filterStyles.chip} ${
                query.permitStatus === status ? filterStyles.chipSelected : ""
              }`}
              aria-pressed={query.permitStatus === status}
              onClick={() => onPatch({ permit: query.permitStatus === status ? null : status })}
            >
              {status[0]?.toUpperCase()}
              {status.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterRow}>
        <div className={filterStyles.field}>
          <label className={filterStyles.label} htmlFor="lead-status">
            Status
          </label>
          <select
            id="lead-status"
            className={filterStyles.select}
            value={query.status ?? ""}
            onChange={(e) =>
              onPatch({ status: LEAD_STATUSES.find((s) => s === e.target.value) ?? null })
            }
          >
            <option value="">Any</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <div className={filterStyles.field}>
          <label className={filterStyles.label} htmlFor="lead-lat">
            Center latitude
          </label>
          <input
            id="lead-lat"
            className={filterStyles.input}
            type="number"
            step="any"
            value={query.center?.lat ?? ""}
            onChange={(e) => onPatch({ lat: committedNumber(e.target.value) })}
          />
        </div>
        <div className={filterStyles.field}>
          <label className={filterStyles.label} htmlFor="lead-lng">
            Center longitude
          </label>
          <input
            id="lead-lng"
            className={filterStyles.input}
            type="number"
            step="any"
            value={query.center?.lng ?? ""}
            onChange={(e) => onPatch({ lng: committedNumber(e.target.value) })}
          />
        </div>
        <div className={filterStyles.field}>
          <label className={filterStyles.label} htmlFor="lead-radius">
            Radius, mi
          </label>
          <input
            id="lead-radius"
            className={filterStyles.input}
            type="number"
            step="0.5"
            value={query.radiusMi}
            onChange={(e) => onPatch({ r: committedNumber(e.target.value) })}
          />
        </div>
      </div>
      {hasActiveFilters(query) ? (
        <button
          type="button"
          className={styles.clear}
          onClick={() =>
            onPatch({
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
      ) : null}
    </section>
  );
}

function committedNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

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
      <Filters query={query} onPatch={patch} />
      {body}
    </section>
  );
}
