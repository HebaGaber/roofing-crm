// B-07 T025 / B-09 board match (CrmLead1440/768/390, CrmLeadNoAddress390, CrmLeadNoContractor390,
// CrmLeadLoading390, CrmLeadSaving390, CrmLeadSaveFailed390, CrmLeadDeleted390, CrmLeadStale390,
// CrmLeadElsewhere390): lead detail (AC-3, AC-5, FR-004, FR-005). Status, assignee, notes and the
// append-only history come from `leads.get`. The signals snapshot is shown as current ONLY when
// the lead's property is still in the current run; otherwise a "Not in the current run" state
// replaces it and no snapshot value is rendered as current (constitution XI, P0-4).
// 1440: the Leads list sits on the left (LeadsPane); 768 and 390: a full page with Back to Leads.
import { Icon, Provenance, StatusPill } from "@crm/ui";
import { LEAD_STATUSES, type LeadEvent, type LeadStatus } from "@crm/shared";
import { useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Skeleton } from "../../components/Skeleton.js";
import { roofAgeBasisLabel } from "../../format/index.js";
import { humanizeCode } from "../../format/labels.js";
import { isNotFoundError, isStaleError } from "./leadErrors.js";
import { LeadBanner } from "./LeadBanner.js";
import { LeadCid } from "./LeadCid.js";
import { LeadProgress } from "./LeadProgress.js";
import { STATUS_LABEL } from "./LeadFilters.js";
import {
  LEAD_STATUS_ICON,
  LEAD_STATUS_KIND,
  coordinateText,
  isFallbackTitle,
} from "./LeadsList.js";
import { LeadsPane } from "./LeadsPane.js";
import { leadTime, myIds, originLabel, personLabel } from "./leadFormat.js";
import { useAddLeadNote, useLead, useUpdateLeadStatus, type LeadDetailData } from "./leadsApi.js";
import { useWide } from "./useWide.js";
import styles from "./Leads.module.css";

const NOTE_MAX_CHARS = 4000; // contracts/leads.md, constitution §6 validation boundary.
const ROOF_BASIS_CODES = ["permit", "new_construction", "built_year", "unknown"] as const;

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function missing(reason: string): ReactElement {
  return <StatusPill status="unavailable" text={reason} />;
}

/** The roof-age basis as words ("Last reroof permit"); an unknown code is humanized, never raw. */
function basisText(code: string): string {
  const known = ROOF_BASIS_CODES.find((c) => c === code);
  return known === undefined ? humanizeCode(code) : roofAgeBasisLabel(known);
}

/** `6.4 yrs` from a day count (the age of an open permit). */
function yearsOf(days: number): string {
  return `${(days / 365).toFixed(1)} yrs`;
}

/** The snapshot taken when the lead was created. Missing fields say why (never blank/0). */
function Signals({ lead }: { readonly lead: LeadDetailData }): ReactElement {
  if (lead.notInCurrentRun) {
    return (
      <section className={styles.section} data-testid="not-in-run" aria-label="Current signals">
        <h3 className={styles.sectionTitle}>
          {lead.currentRunId === undefined
            ? "Not in the current run"
            : `Not in run ${lead.currentRunId}`}
        </h3>
        <StatusPill
          status="unavailable"
          text="Signals withheld: property absent from current run"
          data={{ field: "signals", reason: "not_in_current_run" }}
        />
        <p className={styles.prose}>
          This property is absent from the data run now being served, so its roof age and permit
          signals are not shown. The lead was captured from manifest{" "}
          <LeadCid cid={lead.sourceManifestCid} label="snapshot manifest" />
          {lead.currentManifestCid === undefined ? null : (
            <>
              {"; the run now served is manifest "}
              <LeadCid cid={lead.currentManifestCid} label="current run manifest" />
            </>
          )}
          . Status, notes and history still work.
        </p>
      </section>
    );
  }
  const s = lead.signals;
  if (s === undefined) {
    // The router returns no snapshot when the lead's SIGNALS item was never stored.
    return (
      <section className={styles.section} aria-label="Current signals">
        <h3 className={styles.sectionTitle}>Signals at creation</h3>
        <StatusPill
          status="unavailable"
          text="No signals snapshot stored for this lead"
          data={{ field: "signals", reason: "snapshot_missing" }}
        />
        <Provenance>
          {"Lead captured from manifest "}
          <LeadCid cid={lead.sourceManifestCid} label="snapshot manifest" />
        </Provenance>
      </section>
    );
  }
  return (
    <section className={styles.section} aria-label="Current signals">
      <h3 className={styles.sectionTitle}>Signals at creation</h3>
      <Provenance>
        {`From CountyLens, collected ${s.capturedAt.slice(0, 19).replace("T", " ")} UTC · manifest `}
        <LeadCid cid={lead.sourceManifestCid} label="snapshot manifest" />
      </Provenance>
      <div className={styles.signalsHead} aria-hidden="true">
        <span>Signal</span>
        <span>At creation</span>
      </div>
      <dl className={styles.fields}>
        <Field label="Roof age">
          {s.roofAgeYears === undefined ? (
            missing("Roof age not available")
          ) : (
            <>
              {`${s.roofAgeYears} yrs`}
              {s.roofAgeBasis === undefined ? null : (
                <span className={styles.sub}>{`Basis: ${basisText(s.roofAgeBasis)}`}</span>
              )}
              <span className={styles.sub}>Confidence: not saved with the lead</span>
            </>
          )}
        </Field>
        {s.roofAgeYears === undefined || s.roofAgeBasis !== undefined ? null : (
          <Field label="Basis">{missing("Basis not available")}</Field>
        )}
        <Field label="Main permit">
          {s.openPermitId === undefined ? (
            missing("No open permit at capture")
          ) : (
            <>
              {s.openPermitId}
              {s.openDays === undefined ? null : (
                <span className={styles.sub}>
                  {`open ${s.openDays} days (${yearsOf(s.openDays)})`}
                </span>
              )}
            </>
          )}
        </Field>
        <Field label="Contractor, as printed on permit">
          {s.contractor === undefined ? (
            <>
              {missing("Contractor not published")}
              <span className={styles.sub}>
                Task A's published data does not include a contractor name for permits.
              </span>
            </>
          ) : (
            s.contractor
          )}
        </Field>
        <Field label="BBB">
          {s.bbbRating !== undefined
            ? s.bbbRating
            : missing(
                s.contractor === undefined
                  ? "Not checked · no name to look up"
                  : "BBB rating not available",
              )}
        </Field>
      </dl>
      <p className={styles.prose}>
        <Icon name="help" size="small" />
        {
          " Change since this lead was created: not available yet. The page is not given the current run's signals to compare."
        }
      </p>
      <p className={styles.prose}>
        The lead references this property. Owner details are read from the property when you open
        it; they are not copied into the lead.
      </p>
    </section>
  );
}

/** The text a rep reads for a note event. A note is stored as `note: "<JSON string>"`; show the
 *  rep's own words (quotes, ampersands and line breaks intact), not the storage wrapper. */
export function eventText(event: { readonly kind: string; readonly change: string }): string {
  const prefix = "note: ";
  if (event.kind === "note" && event.change.startsWith(prefix)) {
    try {
      const parsed: unknown = JSON.parse(event.change.slice(prefix.length));
      if (typeof parsed === "string") return parsed;
    } catch {
      // not the expected wrapper: fall through to the stored text
    }
  }
  return event.change;
}

const toStatus = (word: string): LeadStatus | undefined => LEAD_STATUSES.find((s) => s === word);

/** One History line in words: "Status: New → Contacted", "Note added", "Created from Map". */
export function historyText(
  event: { readonly kind: string; readonly change: string },
  createdFrom: string,
): string {
  if (event.kind === "create") return `Created from ${originLabel(createdFrom)}`;
  if (event.kind === "note") return "Note added";
  const match = /^(?:status: )?(\w+) -> (\w+)$/.exec(event.change);
  if (match !== null) {
    const from = toStatus(match[1] ?? "");
    const to = toStatus(match[2] ?? "");
    if (from !== undefined && to !== undefined) {
      return `Status: ${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}`;
    }
  }
  return event.change;
}

const HISTORY_ICON: Readonly<Record<string, string>> = {
  create: "add_circle",
  statusChange: "swap_horiz",
  note: "edit_note",
};

function Notes({
  events,
  mine,
}: {
  readonly events: LeadEvent[];
  readonly mine: readonly string[];
}): ReactElement {
  if (events.length === 0) return <p className={styles.meta}>No notes yet.</p>;
  return (
    <ol className={styles.events}>
      {[...events].reverse().map((event) => (
        <li key={event.sequence} className={styles.note}>
          <div className={styles.eventText}>{eventText(event)}</div>
          <div className={styles.meta}>
            {`${personLabel(event.by, mine)} · ${leadTime(event.at)}`}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Timeline({
  events,
  createdFrom,
  mine,
}: {
  readonly events: LeadEvent[];
  readonly createdFrom: string;
  readonly mine: readonly string[];
}): ReactElement {
  if (events.length === 0) return <p className={styles.meta}>No history yet.</p>;
  return (
    <ol className={styles.timeline}>
      {[...events].reverse().map((event) => (
        <li key={event.sequence} className={styles.timelineItem}>
          <span className={styles.timelineIcon}>
            <Icon name={HISTORY_ICON[event.kind] ?? "history"} size="medium" />
          </span>
          <div>
            <div className={styles.eventText}>{historyText(event, createdFrom)}</div>
            <div className={styles.meta}>
              {`${personLabel(event.by, mine)} · ${leadTime(event.at)}`}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function NextSteps(): ReactElement {
  return (
    <section className={styles.section} aria-label="Next steps">
      <h3 className={styles.sectionTitle}>Next steps</h3>
      <div className={styles.futureRow}>
        <button
          type="button"
          className={styles.future}
          disabled
          title="Outreach is coming soon: email and SMS to owners. Nothing is sent."
        >
          <Icon name="mail" size="medium" />
          Send message
          <span className={styles.soon}>Outreach · Soon</span>
        </button>
        <button
          type="button"
          className={styles.future}
          disabled
          title="Estimates are coming soon: price a roof from the lead."
        >
          <Icon name="request_quote" size="medium" />
          Create estimate
          <span className={styles.soon}>Estimates · Soon</span>
        </button>
      </div>
      <p className={styles.prose}>
        Outreach is coming soon: email and SMS to owners. Nothing is sent.
      </p>
      <p className={styles.prose}>Estimates are coming soon: price a roof from the lead.</p>
    </section>
  );
}

function LeadBody({
  lead,
  onReload,
}: {
  readonly lead: LeadDetailData;
  readonly onReload: () => void;
}): ReactElement {
  const updateStatus = useUpdateLeadStatus();
  const addNote = useAddLeadNote();
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState<LeadStatus | null>(null);
  const mine = myIds();
  const leadKey = lead.leadKey;
  const expectedSequence = lead.eventSequence;

  const changeStatus = (status: LeadStatus): void => {
    setAttempt(status);
    updateStatus.mutate({ leadKey, status, expectedSequence });
  };
  const submitNote = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === "") return;
    addNote.mutate({ leadKey, text: trimmed, expectedSequence }, { onSuccess: () => setText("") });
  };
  const reload = (): void => {
    updateStatus.reset();
    addNote.reset();
    onReload();
  };

  const statusFailed = updateStatus.error !== null && updateStatus.error !== undefined;
  const noteFailed = addNote.error !== null && addNote.error !== undefined;
  const stale =
    (statusFailed && isStaleError(updateStatus.error)) ||
    (noteFailed && isStaleError(addNote.error));
  const mapParams = new URLSearchParams({
    lat: String(lead.lat),
    lng: String(lead.lon),
    r: "0.5",
  });

  return (
    <article className={styles.detail} aria-labelledby="lead-title">
      <header className={styles.head}>
        <h2 id="lead-title" className={styles.title}>
          {lead.address}
        </h2>
        <StatusPill
          status={LEAD_STATUS_KIND[lead.status]}
          text={STATUS_LABEL[lead.status]}
          icon={LEAD_STATUS_ICON[lead.status]}
        />
      </header>
      <p className={styles.leadSub}>
        {isFallbackTitle(lead.address)
          ? `Address not published · ${coordinateText(lead.lat, lead.lon)}`
          : null}
        <span>{`Created from ${originLabel(lead.createdFrom)} · ${leadTime(lead.createdAt)}`}</span>
      </p>

      <div className={styles.actionRow}>
        <label className={styles.statusMenu}>
          <Icon name={LEAD_STATUS_ICON[lead.status]} size="medium" />
          <select
            aria-label="Status"
            className={styles.statusSelect}
            value={lead.status}
            disabled={updateStatus.isPending}
            onChange={(e) => {
              const status = toStatus(e.target.value);
              if (status !== undefined) changeStatus(status);
            }}
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <span
          className={styles.assignee}
          title="Reassigning needs a team list, which is not available yet."
        >
          <Icon name="person" size="medium" />
          <span>{`Assignee: ${personLabel(lead.assignee, mine)}`}</span>
        </span>
        {updateStatus.isPending ? (
          <span className={styles.saving} role="status">
            <Icon name="progress_activity" size="small" />
            Saving the status…
          </span>
        ) : updateStatus.isSuccess ? (
          <span className={styles.saved} role="status">
            <Icon name="cloud_done" size="small" />
            Saved
          </span>
        ) : null}
        <Link className={styles.tonalLink} to={`/map?${mapParams.toString()}`}>
          <Icon name="map" size="medium" />
          Show on map
        </Link>
      </div>

      {lead.notInCurrentRun ? (
        <LeadBanner kind="warning" icon="history" headline="Property not in the current run.">
          The lead keeps its snapshot. Status, notes and history still work.
        </LeadBanner>
      ) : null}
      {stale ? (
        <LeadBanner
          kind="info"
          icon="group"
          headline="This lead was updated by someone else."
          actionLabel="Reload"
          onAction={reload}
        >
          Reload to see the latest.
        </LeadBanner>
      ) : statusFailed ? (
        <LeadBanner
          kind="error"
          icon="sync_problem"
          headline="Couldn't save the status."
          actionLabel="Try again"
          onAction={() => attempt !== null && changeStatus(attempt)}
        >
          The change is undone. Nothing else changed.
        </LeadBanner>
      ) : null}
      {noteFailed && !stale ? (
        <LeadBanner kind="error" icon="sync_problem" headline="Couldn't save the note.">
          Your text is still in the box. Try again.
        </LeadBanner>
      ) : null}

      <Signals lead={lead} />
      <NextSteps />

      <section className={styles.section} aria-label="Notes">
        <h3 className={styles.sectionTitle}>{`Notes · ${lead.notes.length}`}</h3>
        <form className={styles.noteForm} onSubmit={submitNote}>
          <label htmlFor="lead-note">Add a note</label>
          <textarea
            id="lead-note"
            className={styles.textarea}
            maxLength={NOTE_MAX_CHARS}
            placeholder="What happened, what's next"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="submit"
            className={styles.action}
            disabled={addNote.isPending || updateStatus.isPending || text.trim() === ""}
          >
            Add note
          </button>
        </form>
        <Notes events={lead.notes} mine={mine} />
      </section>

      <section className={styles.section} aria-label="History">
        <h3 className={styles.sectionTitle}>History</h3>
        <Timeline events={lead.history} createdFrom={lead.createdFrom} mine={mine} />
      </section>
    </article>
  );
}

/** The lead's title before its data has arrived: the TCAD id is in the link (`48453:tcad:{id}`),
 *  so the loading and error pages keep the heading the boards show instead of going blank. */
function LeadTitle({
  leadKey,
  meta,
}: {
  readonly leadKey: string;
  readonly meta: string;
}): ReactElement {
  const id = leadKey.split(":").pop() ?? "";
  return (
    <header className={styles.titleBlock}>
      <h2 id="lead-title" className={styles.title}>
        {id === "" ? "Lead" : `TCAD ${id}`}
      </h2>
      <p className={styles.leadSub}>{meta}</p>
    </header>
  );
}

function BackLink(): ReactElement {
  return (
    <Link className={styles.back} to="/leads">
      <Icon name="arrow_back" size="medium" />
      Back to Leads
    </Link>
  );
}

export function Component(): ReactElement {
  const { leadKey: routeKey = "" } = useParams();
  const result = useLead(routeKey);
  const wide = useWide();

  let content: ReactElement;
  if (result.status === "pending") {
    content = (
      <>
        <BackLink />
        <LeadTitle leadKey={routeKey} meta="Loading lead…" />
        <div className={styles.loadingCard} role="status" aria-busy="true">
          <LeadProgress label="Loading the lead" />
          <p className={styles.loadingText}>Loading lead…</p>
          <Skeleton variant="cards" count={3} />
        </div>
      </>
    );
  } else if (result.status === "error" && isNotFoundError(result.error)) {
    content = (
      <section className={styles.stateCard} aria-labelledby="lead-not-found" role="status">
        <Icon name="delete" />
        <h2 id="lead-not-found" className={styles.stateTitle}>
          Lead not found
        </h2>
        <p className={styles.stateBody}>
          {`No lead exists for this link (${routeKey}). The link may be wrong, or the lead was deleted with its notes and history.`}
        </p>
        <Link className={styles.tonal} to="/leads">
          Back to Leads
        </Link>
      </section>
    );
  } else if (result.status === "error") {
    content = (
      <>
        <BackLink />
        <LeadTitle leadKey={routeKey} meta="This lead did not load." />
        <LeadBanner
          kind="error"
          icon="error"
          headline="This lead couldn't load."
          actionLabel="Retry"
          onAction={() => {
            void result.refetch();
          }}
        >
          The lead store didn't answer. Try again; nothing was changed.
        </LeadBanner>
      </>
    );
  } else {
    content = (
      <>
        <BackLink />
        <LeadBody
          lead={result.data}
          onReload={() => {
            void result.refetch();
          }}
        />
      </>
    );
  }

  return (
    <div className={wide ? `${styles.split} ${styles.splitWide}` : styles.split}>
      {wide ? <LeadsPane currentKey={routeKey} /> : null}
      <div className={wide ? `${styles.detailCol} ${styles.noBack}` : styles.detailCol}>
        {content}
      </div>
    </div>
  );
}
