// B-07 T025: lead detail (AC-3, AC-5, FR-004, FR-005). Status, assignee, notes and the append-only
// history come from `leads.get`. The signals snapshot is shown as current ONLY when the lead's
// property is still in the current run; otherwise a MissingValue-style "Not in the current run"
// state replaces it and no snapshot value is rendered as current (constitution XI, P0-4).
import { CidDisplay, Provenance, StatusPill } from "@crm/ui";
import { LEAD_STATUSES, type LeadEvent, type LeadStatus } from "@crm/shared";
import { useState, type FormEvent, type ReactElement } from "react";
import { useParams } from "react-router";
import { ErrorBanner } from "../../components/ErrorBanner.js";
import { Skeleton } from "../../components/Skeleton.js";
import { LEAD_STATUS_KIND } from "./LeadsList.js";
import { useAddLeadNote, useLead, useUpdateLeadStatus, type LeadDetailData } from "./leadsApi.js";
import styles from "./Leads.module.css";

const NOTE_MAX_CHARS = 4000; // contracts/leads.md, constitution §6 validation boundary.

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
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

/** The snapshot taken when the lead was created. Missing fields say why (never blank/0). */
function Signals({ lead }: { readonly lead: LeadDetailData }): ReactElement {
  if (lead.notInCurrentRun) {
    return (
      <section className={styles.section} data-testid="not-in-run" aria-label="Current signals">
        <h3 className={styles.sectionTitle}>Not in the current run</h3>
        <StatusPill
          status="unavailable"
          text="Signals withheld: property absent from current run"
          data={{ field: "signals", reason: "not_in_current_run" }}
        />
        <p className={styles.meta}>
          This property is absent from the data run now being served, so its roof age and permit
          signals are not shown. The lead was captured from manifest{" "}
          <CidDisplay cid={lead.sourceManifestCid} />
          {lead.currentManifestCid === undefined ? null : (
            <>
              {"; the run now served is manifest "}
              <CidDisplay cid={lead.currentManifestCid} />
            </>
          )}
          .
        </p>
      </section>
    );
  }
  const s = lead.signals;
  return (
    <section className={styles.section} aria-label="Current signals">
      <h3 className={styles.sectionTitle}>Signals</h3>
      <dl className={styles.fields}>
        <Field label="Roof age">
          {s.roofAgeYears === undefined
            ? missing("Roof age not available")
            : `${s.roofAgeYears} yrs`}
        </Field>
        <Field label="Basis">
          {s.roofAgeBasis === undefined ? missing("Basis not available") : s.roofAgeBasis}
        </Field>
        <Field label="Open permit">
          {s.openPermitId === undefined
            ? missing("No open permit at capture")
            : `${s.openPermitId}${s.openDays === undefined ? "" : ` · open ${s.openDays} days`}`}
        </Field>
        <Field label="Contractor, as printed on permit">
          {s.contractor === undefined ? missing("Contractor not published") : s.contractor}
        </Field>
        <Field label="BBB">
          {s.bbbRating === undefined ? missing("BBB rating not available") : s.bbbRating}
        </Field>
      </dl>
      <Provenance>
        {`Snapshot collected ${s.capturedAt.slice(0, 19).replace("T", " ")} UTC · manifest `}
        <CidDisplay cid={lead.sourceManifestCid} />
      </Provenance>
    </section>
  );
}

function EventList({
  events,
  empty,
}: {
  readonly events: LeadEvent[];
  readonly empty: string;
}): ReactElement {
  if (events.length === 0) return <p className={styles.meta}>{empty}</p>;
  return (
    <ol className={styles.events}>
      {events.map((event) => (
        <li key={event.sequence}>
          <div>{event.change}</div>
          <div className={styles.meta}>
            {`${event.by} · ${event.at.slice(0, 16).replace("T", " ")} UTC`}
          </div>
        </li>
      ))}
    </ol>
  );
}

function LeadBody({ lead }: { readonly lead: LeadDetailData }): ReactElement {
  const updateStatus = useUpdateLeadStatus();
  const addNote = useAddLeadNote();
  const [text, setText] = useState("");
  const leadKey = lead.leadKey;

  const submitNote = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === "") return;
    addNote.mutate({ leadKey, text: trimmed }, { onSuccess: () => setText("") });
  };

  return (
    <section className={styles.page} aria-labelledby="lead-title">
      <header className={styles.head}>
        <h2 id="lead-title" className={styles.title}>
          {lead.address}
        </h2>
        <StatusPill status={LEAD_STATUS_KIND[lead.status]} text={lead.status} />
      </header>

      <section className={styles.section} aria-label="Lead">
        <dl className={styles.fields}>
          <Field label="Assignee">{lead.assignee}</Field>
          <Field label="Created">{`${lead.createdAt.slice(0, 16).replace("T", " ")} UTC`}</Field>
          <Field label="Status">
            <select
              aria-label="Status"
              value={lead.status}
              disabled={updateStatus.isPending}
              onChange={(e) => {
                const status = LEAD_STATUSES.find((s: LeadStatus) => s === e.target.value);
                if (status !== undefined) updateStatus.mutate({ leadKey, status });
              }}
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
        </dl>
        {updateStatus.error === null || updateStatus.error === undefined ? null : (
          <ErrorBanner message="Status could not be saved. Try again." />
        )}
      </section>

      <Signals lead={lead} />

      <section className={styles.section} aria-label="Notes">
        <h3 className={styles.sectionTitle}>Notes</h3>
        <EventList events={lead.notes} empty="No notes yet." />
        <form className={styles.noteForm} onSubmit={submitNote}>
          <label htmlFor="lead-note">Add a note</label>
          <textarea
            id="lead-note"
            className={styles.textarea}
            maxLength={NOTE_MAX_CHARS}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className={styles.action} disabled={addNote.isPending}>
            Add note
          </button>
        </form>
        {addNote.error === null || addNote.error === undefined ? null : (
          <ErrorBanner message="Note could not be saved. Try again." />
        )}
      </section>

      <section className={styles.section} aria-label="History">
        <h3 className={styles.sectionTitle}>History</h3>
        <EventList events={lead.history} empty="No history yet." />
      </section>
    </section>
  );
}

export function Component(): ReactElement {
  const { leadKey: routeKey = "" } = useParams();
  const result = useLead(routeKey);
  if (result.status === "pending") return <Skeleton variant="cards" />;
  if (result.status === "error") {
    return (
      <ErrorBanner
        message="This lead could not be loaded."
        onRetry={() => {
          void result.refetch();
        }}
      />
    );
  }
  return <LeadBody lead={result.data} />;
}
