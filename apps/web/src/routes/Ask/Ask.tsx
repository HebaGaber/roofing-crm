// B-09 T039/T040: the Ask screen (contracts/agent-api.md; agent-design.md smeargle §1/§4). A rep
// types a plain-language question; `agent.ask` returns a grounded, cited `AgentAnswer`
// (packages/shared/src/agent/answer.ts) rendered claim-by-claim with its own citations — never a
// result the API didn't actually return. Creating a lead from a proposal calls
// `agent.confirmLead` only after an explicit "Create lead" click, never automatically (ADR §6.2
// G7, contracts/agent-api.md "Not model-invoked" — the model's own tool set has no path to
// `LeadService.create`).
//
// `data-state` mapping (T040, agent-design.md smeargle §4) — a small, closed set the Playwright
// suite (tests/e2e/responsive/ask.spec.ts, built next) asserts against verbatim. `OUTCOME_STATE`
// below is the single source of truth:
//   idle            nothing asked yet this screen load
//   working         the `agent.ask` mutation is in flight, no response yet
//   answer          outcome === "answered"
//   no_results      outcome === "empty_in_scope" | "field_not_published"
//   low_confidence  outcome === "needs_clarification"
//   out_of_scope    outcome === "out_of_scope"
//   not_found       outcome === "not_found"
//   throttled       outcome === "rate_limited"
//   paused          outcome === "paused"
//   timed_out       outcome === "timed_out"
//
// Known gap (flagged by ash, the backend builder, in this story's run-log): a `needs_clarification`
// answer does not currently carry a candidate-place list on the wire (only `plan`/`counts`), even
// though the design calls for "top 3 places as buttons." This screen renders the generic rephrase
// prompt below for that state rather than inventing button data the API never sends; see this
// story's build report for the full note.
import type { AgentAnswer } from "@crm/shared";
import { CidDisplay, MissingReason, Provenance, StatusPill } from "@crm/ui";
import { useState, type FormEvent, type ReactElement } from "react";
import { Link } from "react-router";
import { useAskAgent, useConfirmLead } from "./askApi.js";
import styles from "./Ask.module.css";

type AskState =
  | "idle"
  | "working"
  | "answer"
  | "no_results"
  | "low_confidence"
  | "out_of_scope"
  | "not_found"
  | "throttled"
  | "paused"
  | "timed_out";

/** The one source of truth for outcome -> UI state (see header comment). */
export const OUTCOME_STATE: Readonly<Record<AgentAnswer["outcome"], AskState>> = {
  answered: "answer",
  empty_in_scope: "no_results",
  field_not_published: "no_results",
  needs_clarification: "low_confidence",
  out_of_scope: "out_of_scope",
  not_found: "not_found",
  rate_limited: "throttled",
  paused: "paused",
  timed_out: "timed_out",
};

type NonAnswerState = Exclude<AskState, "idle" | "working" | "answer">;

// T059 (AC-8 re-diff): copy aligned to the prototype's actual wording (design/prototype/
// Explore1440.dc.html lines ~412-1138, presets crmasknone/crmaskslow/crmaskthrottle/
// crmaskpaused) where it was a plain string with no interactive chip attached. The prototype's
// exact seconds-remaining ("Ask again in 40 s") and the "widen"/"use X instead" chips are NOT
// reproduced here — the wire has no `retryAfterSec` on a rate-limited outcome and `agent.ask`
// takes only `{question, threadId}`, no structured retry/edit; adding either would mean
// reopening the accepted `AgentAnswer`/`agent.ask` contract shapes (ADR-06 §4, contracts/
// agent-api.md), not a copy fix. Logged as deferred in design/design-review-log.md.
const STATE_MESSAGE: Readonly<Record<NonAnswerState, string>> = {
  no_results: "I found no properties that match. Try a bigger radius or a lower roof age.",
  low_confidence:
    "I'm not sure which place you meant. Try rephrasing with a more specific place name.",
  out_of_scope: "That's outside Travis County, so I can't answer it from this index.",
  not_found: "I couldn't confidently place that — try a more specific place name.",
  throttled: "You've asked too many questions in a short time. Wait a moment, then try again.",
  paused: "Today's question budget is used up. It resets at 00:00 UTC.",
  timed_out:
    "Took too long. The answer stopped at the 25 s limit; nothing was counted. Try again, or ask something narrower.",
};

const ALERT_STATES: ReadonlySet<NonAnswerState> = new Set(["throttled", "paused", "timed_out"]);

function newThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Plan = AgentAnswer["plan"];

function describeFilters(filters: Plan["filters"]): readonly string[] {
  const parts: string[] = [];
  if (filters.kind !== undefined) parts.push(filters.kind);
  if (filters.roofAgeMinYears !== undefined) parts.push(`roof age ≥ ${filters.roofAgeMinYears} yrs`);
  if (filters.roofConfidenceMin !== undefined) {
    parts.push(`roof confidence ≥ ${filters.roofConfidenceMin}`);
  }
  if (filters.statusClass !== undefined && filters.statusClass.length > 0) {
    parts.push(`permit ${filters.statusClass.join("/")}`);
  }
  if (filters.openYearsMin !== undefined) parts.push(`open ≥ ${filters.openYearsMin} yrs`);
  if (filters.tenureYearsMin !== undefined) parts.push(`owner tenure ≥ ${filters.tenureYearsMin} yrs`);
  if (filters.permitNumber !== undefined) parts.push(`permit # ${filters.permitNumber}`);
  return parts;
}

/** "How I read this" (T059, AC-8 re-diff fix): the prototype shows this on every completed turn
 *  (Explore1440.dc.html line ~414, `{{ans.how}}`). `answer.plan` already carries everything it
 *  needs — `packages/shared/src/agent/queryPlan.ts` even comments `// "How I read this"` on the
 *  field — but the first wave of this screen (T039/T040) never rendered it. Pure display, no new
 *  data and no architecture change, so fixed directly rather than deferred. The prototype's
 *  "tap to change, ✕ to drop" editable chips are NOT reproduced: `agent.ask` takes only
 *  `{question, threadId}` with no structured plan-edit input, so making this editable would mean
 *  adding a new procedure input shape, not a copy/token fix. Logged as deferred. */
function planSummary(plan: Plan): string {
  const place = plan.area.resolved !== undefined ? plan.area.resolved.name : plan.area.query;
  const base = `within ${plan.area.radiusMi} mi of ${place}`;
  const filters = describeFilters(plan.filters);
  return filters.length === 0 ? base : `${base}, ${filters.join(", ")}`;
}

type Citation = AgentAnswer["citations"][number];

function CitationLine({ citation }: { readonly citation: Citation }): ReactElement {
  const cid = citation.propertyCid ?? citation.permitCid;
  const kindLabel =
    citation.kind === "property"
      ? "Property"
      : citation.kind === "permit"
        ? "Permit"
        : citation.kind === "place"
          ? "Place"
          : "Run";
  return (
    <li className={styles.citation} data-citation-kind={citation.kind}>
      <span className={styles.citationLabel}>
        {kindLabel}
        {cid === undefined ? null : <CidDisplay cid={cid} />}
      </span>
      <Provenance>
        {citation.sourceUrl === null ? (
          <MissingReason field="source_url" reason="not_in_export" />
        ) : (
          <a
            href={citation.sourceUrl}
            className={styles.link}
            rel="noopener noreferrer"
            target="_blank"
          >
            {citation.sourceUrl}
          </a>
        )}
        {` · collected ${citation.capturedAt.slice(0, 19).replace("T", " ")} UTC · table `}
        <CidDisplay cid={citation.tableCid} />
        {" · manifest "}
        <CidDisplay cid={citation.manifestCid} />
      </Provenance>
      {citation.kind === "property" && citation.propertyCid !== undefined ? (
        <Link
          className={styles.openMap}
          to={`/?sel=${encodeURIComponent(citation.propertyCid)}`}
        >
          Open on map
        </Link>
      ) : null}
    </li>
  );
}

function ClaimItem({
  claim,
  citations,
}: {
  readonly claim: AgentAnswer["claims"][number];
  readonly citations: readonly Citation[];
}): ReactElement {
  const byId = new Map(citations.map((c) => [c.id, c]));
  const cited = claim.citationIds
    .map((id) => byId.get(id))
    .filter((c): c is Citation => c !== undefined);
  return (
    <li className={styles.claim}>
      <p className={styles.claimText}>{claim.text}</p>
      <ul className={styles.citations} aria-label="Citations">
        {cited.map((citation) => (
          <CitationLine key={citation.id} citation={citation} />
        ))}
      </ul>
    </li>
  );
}

type Proposal = NonNullable<AgentAnswer["proposals"]>[number];

/** Creating a lead from a proposal is a separate, explicit click — never automatic on receiving
 *  the proposal (ADR §6.2 G7). */
function ProposalCard({
  proposal,
  threadId,
}: {
  readonly proposal: Proposal;
  readonly threadId: string;
}): ReactElement {
  const confirmLead = useConfirmLead();

  if (proposal.alreadyLead) {
    return (
      <li className={styles.proposal} data-tcad-id={proposal.tcadId}>
        <StatusPill status="info" text={`TCAD ${proposal.tcadId} is already a lead`} />
      </li>
    );
  }

  return (
    <li className={styles.proposal} data-tcad-id={proposal.tcadId}>
      <span className={styles.proposalLabel}>{`TCAD ${proposal.tcadId}`}</span>
      <button
        type="button"
        className={styles.confirmButton}
        disabled={confirmLead.isPending || confirmLead.isSuccess}
        onClick={() => confirmLead.mutate({ threadId, tcadId: proposal.tcadId })}
      >
        Create lead
      </button>
      {confirmLead.isSuccess ? <StatusPill status="verified" text="Lead created" /> : null}
      {confirmLead.isError ? (
        <StatusPill status="error" text="Could not create lead. Try again." />
      ) : null}
    </li>
  );
}

function AnsweredBody({
  answer,
  threadId,
}: {
  readonly answer: AgentAnswer;
  readonly threadId: string;
}): ReactElement {
  return (
    <div className={styles.answer}>
      {answer.claims.length === 0 ? (
        <p className={styles.notice}>
          {`${answer.counts.matched} match${answer.counts.matched === 1 ? "" : "es"}, but none ` +
            "could be shown with a verified citation."}
        </p>
      ) : (
        <ul className={styles.claims} aria-label="Answer">
          {answer.claims.map((claim, index) => (
            // Claims have no stable id of their own on the wire; index is fine for a single,
            // never-reordered render of one answer.
            <ClaimItem key={index} claim={claim} citations={answer.citations} />
          ))}
        </ul>
      )}
      {answer.missing.length === 0 ? null : (
        <ul className={styles.missingList} aria-label="Missing data">
          {answer.missing.map((m) => (
            <li key={m.field}>
              <StatusPill
                status="unavailable"
                text={`${m.field}: ${m.reason}`}
                data={{ field: m.field, reason: m.reason }}
              />
            </li>
          ))}
        </ul>
      )}
      {answer.proposals === undefined || answer.proposals.length === 0 ? null : (
        <ul className={styles.proposals} aria-label="Create lead">
          {answer.proposals.map((proposal) => (
            <ProposalCard key={proposal.tcadId} proposal={proposal} threadId={threadId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AnswerBody({
  answer,
  threadId,
}: {
  readonly answer: AgentAnswer;
  readonly threadId: string;
}): ReactElement {
  if (answer.outcome === "answered") {
    return <AnsweredBody answer={answer} threadId={threadId} />;
  }
  const state = OUTCOME_STATE[answer.outcome] as NonAnswerState;
  return (
    <p role={ALERT_STATES.has(state) ? "alert" : "status"} className={styles.notice}>
      {STATE_MESSAGE[state]}
    </p>
  );
}

export function Component(): ReactElement {
  const [threadId] = useState(newThreadId);
  const [question, setQuestion] = useState("");
  const ask = useAskAgent();

  const state: AskState = ask.isPending
    ? "working"
    : ask.data === undefined
      ? "idle"
      : OUTCOME_STATE[ask.data.outcome];

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed === "") return;
    ask.mutate({ question: trimmed, threadId });
  };

  return (
    <section aria-label="Ask" data-route="ask" data-state={state} className={styles.page}>
      <h2 className={styles.title}>Ask about a roofing opportunity</h2>
      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="ask-question" className={styles.label}>
          Question
        </label>
        <input
          id="ask-question"
          className={styles.input}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. open roofing permits older than five years within five miles of Pflugerville"
          maxLength={500}
          disabled={ask.isPending}
        />
        <button
          type="submit"
          className={styles.action}
          disabled={ask.isPending || question.trim() === ""}
        >
          Ask
        </button>
      </form>

      {ask.isPending ? (
        <p role="status" aria-live="polite" className={styles.notice}>
          Working…
        </p>
      ) : null}

      {ask.isError ? (
        <p role="alert" className={styles.notice}>
          The agent could not answer. Try again.
        </p>
      ) : null}

      {ask.data === undefined ? null : (
        <>
          <p className={styles.plan}>
            <b>How I read this:</b> {planSummary(ask.data.plan)}
          </p>
          <AnswerBody answer={ask.data} threadId={threadId} />
        </>
      )}
    </section>
  );
}
