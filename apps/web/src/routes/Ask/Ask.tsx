// B-09 T039/T040 + review fixes (CR-B-09 #16/#20): the Ask screen (contracts/agent-api.md;
// agent-design.md smeargle §1/§4). A rep types a plain-language question; `agent.ask` returns a
// grounded, cited `AgentAnswer` (packages/shared/src/agent/answer.ts) rendered claim-by-claim with
// its own citations — never a result the API didn't actually return. Creating a lead from a
// proposal calls `agent.confirmLead` only after an explicit "Create lead" click, never
// automatically (ADR §6.2 G7; the model's own tool set has no path to `LeadService.create`).
//
// Design: the Ask boards design/prototype/CrmAsk390/768/1440 (answer), CrmAskWorking390 +
// CrmAgentWorking390/1440 (working), CrmAskNoResults390, CrmAskLowConf390, CrmAskOutside390,
// CrmAskNotFound390, CrmAskThrottled390, CrmAskPaused390 / CrmAgentPaused390, CrmAskSlow390 /
// CrmAgentSlow390/1440, CrmAskConfirm*/CrmAskCreated390/CrmAskCreateFailed390 (create lead). All of
// them `dc-import` the shared Explore1440 board with a `crmask*` / `ai*` preset.
//
// `data-state` mapping (T040, agent-design.md smeargle §4) — a closed set the Playwright suite
// (tests/e2e/responsive/ask.spec.ts) asserts against verbatim. `OUTCOME_STATE` is the single
// source of truth:
//   idle            nothing asked yet this screen load
//   working         the `agent.ask` mutation is in flight, no response yet
//   answer          outcome === "answered"
//   no_results      outcome === "empty_in_scope" | "field_not_published"
//   low_confidence  outcome === "needs_clarification" (candidate places as buttons)
//   out_of_scope    outcome === "out_of_scope"
//   not_found       outcome === "not_found"
//   throttled       outcome === "rate_limited"  (countdown from `retryAfterSec`)
//   paused          outcome === "paused"        (reset time from `resetsAt`)
//   timed_out       outcome === "timed_out"
//   error           the `agent.ask` call itself failed (no answer)
//
// Accessibility: one polite live region (`role="status"`) announces "working" and then the result
// heading; focus moves to that heading when the result arrives. Limit banners are `role="alert"`.
import type { AgentAnswer } from "@crm/shared";
import { missingReasonLabel } from "@crm/oracle-contract";
import { CidDisplay, formatUtc, Icon, MissingReason, Provenance, StatusPill } from "@crm/ui";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { useAskAgent, useConfirmLead } from "./askApi.js";
import {
  AGENT_TURN_LIMIT_SEC,
  clarifyQuestion,
  confirmErrorCopy,
  emptyExplanation,
  exclusionNotes,
  fieldNotPublishedText,
  hasModelPlan,
  missingText,
  pausedText,
  placeOf,
  planSummary,
  throttleText,
  timedOutText,
} from "./askCopy.js";
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
  | "timed_out"
  | "error";

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

/** The result heading per outcome (focused and announced when the result arrives). */
function headingOf(answer: AgentAnswer): string {
  switch (answer.outcome) {
    case "answered":
      return "Answer";
    case "empty_in_scope":
      return "No matches";
    case "field_not_published":
      return "Not in the published data";
    case "needs_clarification":
      return answer.candidates === undefined
        ? "I couldn't read that question"
        : "Which place did you mean?";
    case "out_of_scope":
      return missingReasonLabel("out_of_scope");
    case "not_found":
      return "Place not found";
    case "rate_limited":
      return "Too many questions in a short time";
    case "paused":
      return "Asking is paused for today";
    case "timed_out":
      return "Took too long";
  }
}

const ERROR_HEADING = "The agent could not answer";

function newThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Whole seconds since `active` turned on (the Working… timer); 0 while inactive. */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return active ? seconds : 0;
}

/** Counts `from` down to 0, once per second, restarting whenever `key` changes. */
function useCountdown(from: number | undefined, key: unknown): number | undefined {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    setLeft(from);
    if (from === undefined || from <= 0) return undefined;
    const id = setInterval(() => {
      setLeft((s) => {
        const next = (s ?? 0) - 1;
        if (next <= 0) clearInterval(id);
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [from, key]);
  return left;
}

type Citation = AgentAnswer["citations"][number];
type Claim = AgentAnswer["claims"][number];

/** Claims carry no id on the wire: key by their citations plus text, plus the position only to
 *  break an exact duplicate — stable for a given answer, unlike a bare array index. */
function claimIds(claims: readonly Claim[]): string[] {
  const seen = new Map<string, number>();
  return claims.map((claim) => {
    const base = `${claim.citationIds.join(".")}|${claim.text}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

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
        {` · collected ${formatUtc(citation.capturedAt)} UTC · table `}
        <CidDisplay cid={citation.tableCid} />
        {" · manifest "}
        <CidDisplay cid={citation.manifestCid} />
      </Provenance>
      {citation.kind === "property" && citation.propertyCid !== undefined ? (
        <Link className={styles.openMap} to={`/?sel=${encodeURIComponent(citation.propertyCid)}`}>
          Open on map
        </Link>
      ) : null}
    </li>
  );
}

function ClaimItem({
  id,
  claim,
  byId,
}: {
  readonly id: string;
  readonly claim: Claim;
  readonly byId: ReadonlyMap<number, Citation>;
}): ReactElement {
  const cited = claim.citationIds
    .map((citationId) => byId.get(citationId))
    .filter((c): c is Citation => c !== undefined);
  return (
    <li className={styles.claim} data-claim-id={id}>
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
 *  the proposal (ADR §6.2 G7). Typed failures get their own message (CrmAskCreateFailed390). */
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

  const failure = confirmLead.isError ? confirmErrorCopy(confirmLead.error) : undefined;
  const done = confirmLead.isSuccess || failure?.status === "info";
  return (
    <li className={styles.proposal} data-tcad-id={proposal.tcadId}>
      <span className={styles.proposalLabel}>{`TCAD ${proposal.tcadId}`}</span>
      <button
        type="button"
        className={styles.confirmButton}
        disabled={confirmLead.isPending || done || (failure !== undefined && !failure.retryable)}
        onClick={() => confirmLead.mutate({ threadId, tcadId: proposal.tcadId })}
      >
        {confirmLead.isPending ? "Creating…" : "Create lead"}
      </button>
      {confirmLead.isSuccess ? (
        <>
          <StatusPill status="verified" text="Lead created" />
          <Link className={styles.openMap} to="/leads">
            Open Leads
          </Link>
        </>
      ) : null}
      {failure === undefined ? null : (
        <span
          className={styles.proposalNote}
          role={failure.status === "info" ? undefined : "alert"}
        >
          <StatusPill status={failure.status} text={failure.text} />
        </span>
      )}
    </li>
  );
}

function MissingList({
  missing,
}: {
  readonly missing: AgentAnswer["missing"];
}): ReactElement | null {
  if (missing.length === 0) return null;
  return (
    <ul className={styles.missingList} aria-label="Missing data">
      {missing.map((m) => (
        <li key={`${m.field}|${m.reason}`}>
          <StatusPill
            status="unavailable"
            text={missingText(m)}
            data={{
              field: m.field,
              reason: m.reason,
              ...(m.count === undefined ? {} : { count: String(m.count) }),
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function Notes({ notes }: { readonly notes: readonly string[] }): ReactElement | null {
  if (notes.length === 0) return null;
  return (
    <ul className={styles.notes}>
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

function AnsweredBody({
  answer,
  threadId,
}: {
  readonly answer: AgentAnswer;
  readonly threadId: string;
}): ReactElement {
  const byId = new Map(answer.citations.map((c) => [c.id, c]));
  const ids = claimIds(answer.claims);
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
            <ClaimItem key={ids[index]} id={ids[index] ?? ""} claim={claim} byId={byId} />
          ))}
        </ul>
      )}
      <Notes notes={exclusionNotes(answer)} />
      <MissingList missing={answer.missing} />
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

function Banner({
  tone,
  icon,
  children,
}: {
  readonly tone: "warning" | "info";
  readonly icon: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div role="alert" className={`${styles.banner} ${styles[tone]}`}>
      <Icon name={icon} size="medium" />
      <p className={styles.bannerBody}>{children}</p>
    </div>
  );
}

interface BodyProps {
  readonly answer: AgentAnswer;
  readonly threadId: string;
  readonly secondsLeft: number | undefined;
  readonly onPickPlace: (name: string) => void;
  readonly onRetry: () => void;
}

function AnswerBody({
  answer,
  threadId,
  secondsLeft,
  onPickPlace,
  onRetry,
}: BodyProps): ReactElement {
  switch (answer.outcome) {
    case "answered":
      return <AnsweredBody answer={answer} threadId={threadId} />;
    case "empty_in_scope":
      return (
        <div className={styles.answer}>
          <p className={styles.notice}>{emptyExplanation(answer)}</p>
          <Notes notes={exclusionNotes(answer)} />
          <MissingList missing={answer.missing} />
        </div>
      );
    case "field_not_published":
      return (
        <div className={styles.answer}>
          <p className={styles.notice}>{fieldNotPublishedText(answer)}</p>
          <MissingList missing={answer.missing} />
        </div>
      );
    case "needs_clarification": {
      const candidates = answer.candidates;
      if (candidates === undefined) {
        return (
          <p className={styles.notice}>
            I couldn&apos;t read that question. Try rephrasing it with a place and what to look for.
          </p>
        );
      }
      if (candidates.length === 0) {
        return (
          <p className={styles.notice}>
            The question didn&apos;t name a place I could match. Add a town, ZIP or &quot;lat,
            lon&quot;.
          </p>
        );
      }
      return (
        <div className={styles.answer}>
          <p className={styles.notice}>
            {`I'm not sure which place “${answer.plan.area.query}” means. Pick one and I'll ask again with it.`}
          </p>
          <div className={styles.chips} role="group" aria-label="Places I know">
            {candidates.map((candidate) => (
              <button
                key={candidate.name}
                type="button"
                className={styles.chip}
                data-place={candidate.name}
                aria-label={`Use ${candidate.name} (${Math.round(candidate.score * 100)}% match)`}
                onClick={() => onPickPlace(candidate.name)}
              >
                <Icon name="location_on" size="small" />
                {`Use ${candidate.name}`}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "out_of_scope":
      return (
        <p className={styles.notice}>
          {`“${answer.plan.area.query}” is outside the area this CRM covers, so I didn't search. Try a place inside it.`}
        </p>
      );
    case "not_found":
      return (
        <p className={styles.notice}>
          {`I couldn't find “${placeOf(answer.plan)}” among the places I know. Check the spelling, or name a nearby town.`}
        </p>
      );
    case "rate_limited":
      return (
        <Banner tone="warning" icon="hourglass_top">
          {throttleText(secondsLeft)}
        </Banner>
      );
    case "paused":
      return (
        <Banner tone="info" icon="pause_circle">
          {pausedText(answer.resetsAt)}
        </Banner>
      );
    case "timed_out":
      return (
        <div className={styles.answer}>
          <Banner tone="warning" icon="timer_off">
            <b>Took too long.</b> {timedOutText()}
          </Banner>
          <button type="button" className={styles.action} onClick={onRetry}>
            Try again
          </button>
        </div>
      );
  }
}

function WorkingPanel({ seconds }: { readonly seconds: number }): ReactElement {
  return (
    <div className={styles.working} aria-busy="true">
      <div className={styles.workingRow}>
        <span className={styles.spin}>
          <Icon name="progress_activity" size="medium" />
        </span>
        <b className={styles.workingLabel}>Working…</b>
        <span
          className={styles.timer}
          role="timer"
          aria-live="off"
          aria-label={`${seconds} seconds elapsed`}
        >
          {`${seconds} s`}
        </span>
      </div>
      <div className={styles.progress} role="progressbar" aria-label="Working">
        <i />
      </div>
      <span className={styles.workingHint}>
        {`The answer and its citations arrive together. It stops at ${AGENT_TURN_LIMIT_SEC} s.`}
      </span>
      <div className={styles.skeleton} aria-hidden="true">
        <span className={styles.skeletonLine} />
        <span className={styles.skeletonLineShort} />
        <span className={styles.skeletonLine} />
      </div>
    </div>
  );
}

export function Component(): ReactElement {
  const [threadId] = useState(newThreadId);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const ask = useAskAgent();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const data = ask.data;
  const state: AskState = ask.isPending
    ? "working"
    : data !== undefined
      ? OUTCOME_STATE[data.outcome]
      : ask.isError
        ? "error"
        : "idle";

  const seconds = useElapsedSeconds(ask.isPending);
  const secondsLeft = useCountdown(
    data?.outcome === "rate_limited" ? data.retryAfterSec : undefined,
    data,
  );
  const pausedUntil =
    data?.outcome === "paused" && data.resetsAt !== undefined ? Date.parse(data.resetsAt) : NaN;
  const blocked =
    (data?.outcome === "rate_limited" && secondsLeft !== undefined && secondsLeft > 0) ||
    (!Number.isNaN(pausedUntil) && Date.now() < pausedUntil);

  const heading = ask.isPending
    ? undefined
    : data !== undefined
      ? headingOf(data)
      : ask.isError
        ? ERROR_HEADING
        : undefined;

  useEffect(() => {
    if (heading !== undefined) headingRef.current?.focus();
  }, [heading, data]);

  const send = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    setAsked(trimmed);
    ask.mutate({ question: trimmed, threadId });
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (ask.isPending || blocked) return;
    send(question);
  };

  const pickPlace = (name: string): void => {
    if (data === undefined) return;
    const next = clarifyQuestion(asked !== "" ? asked : question, data.plan, name);
    setQuestion(next);
    send(next);
  };

  const retry = (): void => send(asked !== "" ? asked : question);

  const announcement = ask.isPending ? "Working on your question…" : (heading ?? "");

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
          readOnly={ask.isPending}
          aria-busy={ask.isPending}
        />
        <button
          type="submit"
          className={styles.action}
          disabled={ask.isPending || blocked || question.trim() === ""}
        >
          Ask
        </button>
      </form>

      <p role="status" aria-live="polite" className={styles.srOnly}>
        {announcement}
      </p>

      {ask.isPending ? <WorkingPanel seconds={seconds} /> : null}

      {heading === undefined ? null : (
        <article className={styles.result} aria-labelledby="ask-result-heading">
          <h3
            id="ask-result-heading"
            ref={headingRef}
            tabIndex={-1}
            className={styles.resultHeading}
          >
            {heading}
          </h3>
          {asked === "" ? null : <p className={styles.asked}>{asked}</p>}
          {data === undefined ? (
            <p role="alert" className={styles.notice}>
              The agent could not answer. Nothing was created. Try again.
            </p>
          ) : (
            <>
              {data.plan.slotSources["area"] === "inherited" && hasModelPlan(data) ? (
                <StatusPill
                  status="info"
                  icon="forum"
                  text="Follow-up · area from your last question"
                />
              ) : null}
              {hasModelPlan(data) ? (
                <p className={styles.plan}>
                  <b>How I read this:</b> {planSummary(data.plan)}
                </p>
              ) : null}
              <AnswerBody
                answer={data}
                threadId={threadId}
                secondsLeft={secondsLeft}
                onPickPlace={pickPlace}
                onRetry={retry}
              />
            </>
          )}
        </article>
      )}
    </section>
  );
}
