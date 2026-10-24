// B-09 T039/T040 + review fixes (CR-B-09 finding 16/finding 20): the Ask screen (contracts/agent-api.md;
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
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router";
import { ASK_QUESTION_PARAM } from "../../components/Onboarding/firstVisit.js";
import { useAskAgent, useConfirmLead, useRunInfo } from "./askApi.js";
import {
  AGENT_TURN_LIMIT_SEC,
  clarifyQuestion,
  composerNote,
  confirmErrorCopy,
  emptyExplanation,
  exclusionNotes,
  fieldNotPublishedText,
  hasModelPlan,
  missingText,
  pausedText,
  placeOf,
  planSummary,
  SUGGESTIONS,
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

/** The longest question the box (and `agent.ask`'s input) accepts. */
const MAX_QUESTION_LENGTH = 500;

/** The `?q=` text the first-visit card's example links carry: trimmed, and ignored when empty or
 *  longer than the box allows (never silently cut into a different question). */
export function prefillFrom(param: string | null): string {
  const text = (param ?? "").trim();
  return text === "" || text.length > MAX_QUESTION_LENGTH ? "" : text;
}

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
type Proposal = NonNullable<AgentAnswer["proposals"]>[number];

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

/** The citations the claims actually use, numbered 1..n in first-cited order (CrmAsk390/768/1440:
 *  "[1–3]" in the text ↔ the numbered rows below). Uncited citations are not listed. */
function numberSources(
  claims: readonly Claim[],
  citations: readonly Citation[],
): { readonly sources: readonly Citation[]; readonly numberOf: ReadonlyMap<number, number> } {
  const byId = new Map(citations.map((c) => [c.id, c]));
  const numberOf = new Map<number, number>();
  const sources: Citation[] = [];
  for (const claim of claims) {
    for (const id of claim.citationIds) {
      const citation = byId.get(id);
      if (citation === undefined || numberOf.has(id)) continue;
      numberOf.set(id, sources.length + 1);
      sources.push(citation);
    }
  }
  return { sources, numberOf };
}

function kindLabel(kind: Citation["kind"]): string {
  return kind === "property"
    ? "Property"
    : kind === "permit"
      ? "Permit"
      : kind === "place"
        ? "Place"
        : "Run";
}

/** A source row's title: the TCAD account id when the citation carries one (the contract publishes
 *  no street address — CRM-HANDOFF § 9 "the property title is the TCAD account id"), else its kind. */
function sourceTitle(citation: Citation): string {
  if (citation.tcadId === undefined) return kindLabel(citation.kind);
  return citation.kind === "property"
    ? `TCAD ${citation.tcadId}`
    : `${kindLabel(citation.kind)} · TCAD ${citation.tcadId}`;
}

/** Creating a lead from a proposal is a separate, explicit click — never automatic on receiving
 *  the proposal (ADR §6.2 G7). Typed failures get their own message (CrmAskCreateFailed390). */
function ProposalAction({
  proposal,
  threadId,
}: {
  readonly proposal: Proposal;
  readonly threadId: string;
}): ReactElement {
  const confirmLead = useConfirmLead();

  if (proposal.alreadyLead) {
    return <StatusPill status="info" icon="contact_page" text="Already a lead" />;
  }

  const failure = confirmLead.isError ? confirmErrorCopy(confirmLead.error) : undefined;
  const done = confirmLead.isSuccess || failure?.status === "info";
  return (
    <div className={styles.proposalAction}>
      <div className={styles.actionRow}>
        {confirmLead.isSuccess ? (
          <>
            <StatusPill status="verified" text="Lead created" />
            <Link className={styles.textButton} to="/leads">
              Open Leads
            </Link>
          </>
        ) : (
          <button
            type="button"
            className={styles.tonalButton}
            disabled={
              confirmLead.isPending || done || (failure !== undefined && !failure.retryable)
            }
            onClick={() => confirmLead.mutate({ threadId, tcadId: proposal.tcadId })}
          >
            <Icon name="person_add" size="medium" />
            {confirmLead.isPending ? "Creating…" : "Create lead"}
          </button>
        )}
      </div>
      {failure === undefined ? null : failure.status === "info" ? (
        <StatusPill status="info" text={failure.text} />
      ) : (
        <div
          role="alert"
          className={`${styles.banner} ${failure.status === "error" ? styles.danger : styles.warning}`}
        >
          <Icon name={failure.status === "error" ? "error" : "warning"} size="medium" />
          <p className={styles.bannerBody}>{failure.text}</p>
        </div>
      )}
    </div>
  );
}

function SourceRow({
  number,
  citation,
  proposal,
  threadId,
}: {
  readonly number: number;
  readonly citation: Citation;
  readonly proposal: Proposal | undefined;
  readonly threadId: string;
}): ReactElement {
  const cid = citation.propertyCid ?? citation.permitCid;
  return (
    <li
      id={`ask-source-${number}`}
      className={styles.source}
      data-citation-kind={citation.kind}
      {...(citation.tcadId === undefined ? {} : { "data-tcad-id": citation.tcadId })}
    >
      <span className={styles.sourceNumber} aria-hidden="true">
        {number}
      </span>
      <div className={styles.sourceBody}>
        <span className={styles.sourceTitle}>
          <span className={styles.srOnly}>{`Source ${number}: `}</span>
          {sourceTitle(citation)}
        </span>
        {cid === undefined ? null : (
          <span className={styles.sourceCid}>
            {`${kindLabel(citation.kind)} record `}
            <CidDisplay cid={cid} />
          </span>
        )}
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
        <div className={styles.actionRow}>
          {citation.kind === "property" && citation.propertyCid !== undefined ? (
            <Link
              className={styles.textButton}
              to={`/?sel=${encodeURIComponent(citation.propertyCid)}`}
            >
              <Icon name="location_on" size="medium" />
              Open on map
            </Link>
          ) : null}
        </div>
        {proposal === undefined ? null : <ProposalAction proposal={proposal} threadId={threadId} />}
      </div>
    </li>
  );
}

function ClaimItem({
  id,
  claim,
  numberOf,
}: {
  readonly id: string;
  readonly claim: Claim;
  readonly numberOf: ReadonlyMap<number, number>;
}): ReactElement {
  const numbers = [
    ...new Set(
      claim.citationIds
        .map((citationId) => numberOf.get(citationId))
        .filter((n): n is number => n !== undefined),
    ),
  ];
  return (
    <li className={styles.claim} data-claim-id={id}>
      {claim.text}
      {numbers.map((n) => (
        <a key={n} className={styles.citeRef} href={`#ask-source-${n}`} aria-label={`Source ${n}`}>
          {n}
        </a>
      ))}
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
  const ids = claimIds(answer.claims);
  const { sources, numberOf } = numberSources(answer.claims, answer.citations);
  const proposals = answer.proposals ?? [];
  const byTcad = new Map(proposals.map((p) => [p.tcadId, p]));
  // A proposal shows its Create lead on the source row it was cited in (CrmAsk1440 rows; E-59);
  // a proposal no claim cites still gets its own row below. Never a Create lead on a cited row
  // the answer did not propose (design-review-log row 54).
  const onRow = new Set(
    sources
      .filter((c) => c.kind === "property" && c.tcadId !== undefined && byTcad.has(c.tcadId))
      .map((c) => c.tcadId),
  );
  const unplaced = proposals.filter((p) => !onRow.has(p.tcadId));
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
            <ClaimItem key={ids[index]} id={ids[index] ?? ""} claim={claim} numberOf={numberOf} />
          ))}
        </ul>
      )}
      <Notes notes={exclusionNotes(answer)} />
      <MissingList missing={answer.missing} />
      {sources.length === 0 ? null : (
        <ol className={styles.sources} aria-label="Sources">
          {sources.map((citation, index) => (
            <SourceRow
              key={citation.id}
              number={index + 1}
              citation={citation}
              proposal={
                citation.kind === "property" && citation.tcadId !== undefined
                  ? byTcad.get(citation.tcadId)
                  : undefined
              }
              threadId={threadId}
            />
          ))}
        </ol>
      )}
      {unplaced.length === 0 ? null : (
        <ul className={styles.sources} aria-label="Create lead">
          {unplaced.map((proposal) => (
            <li key={proposal.tcadId} className={styles.source} data-tcad-id={proposal.tcadId}>
              <span className={styles.sourceNumber} aria-hidden="true">
                <Icon name="person_add" size="small" />
              </span>
              <div className={styles.sourceBody}>
                <span className={styles.sourceTitle}>{`TCAD ${proposal.tcadId}`}</span>
                <ProposalAction proposal={proposal} threadId={threadId} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Banner({
  tone,
  icon,
  alert = true,
  children,
}: {
  readonly tone: "warning" | "info";
  readonly icon: string;
  /** Budget limits interrupt (`role="alert"`); scope outcomes are the result itself. */
  readonly alert?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div {...(alert ? { role: "alert" } : {})} className={`${styles.banner} ${styles[tone]}`}>
      <Icon name={icon} size="medium" />
      <p className={styles.bannerBody}>{children}</p>
    </div>
  );
}

interface BodyProps {
  readonly answer: AgentAnswer;
  readonly threadId: string;
  readonly secondsLeft: number | undefined;
  readonly keptAnswer: boolean;
  readonly onPickPlace: (name: string) => void;
  readonly onRetry: () => void;
}

function AnswerBody({
  answer,
  threadId,
  secondsLeft,
  keptAnswer,
  onPickPlace,
  onRetry,
}: BodyProps): ReactElement {
  switch (answer.outcome) {
    case "answered":
      return <AnsweredBody answer={answer} threadId={threadId} />;
    case "empty_in_scope":
      return (
        <div className={styles.answer}>
          <p className={styles.lead}>{emptyExplanation(answer)}</p>
          <Notes notes={exclusionNotes(answer)} />
          <MissingList missing={answer.missing} />
        </div>
      );
    case "field_not_published":
      return (
        <div className={styles.answer}>
          <p className={styles.lead}>{fieldNotPublishedText(answer)}</p>
          <MissingList missing={answer.missing} />
        </div>
      );
    case "needs_clarification": {
      const candidates = answer.candidates;
      if (candidates === undefined) {
        return (
          <p className={styles.lead}>
            I couldn&apos;t read that question. Try rephrasing it with a place and what to look for.
          </p>
        );
      }
      if (candidates.length === 0) {
        return (
          <p className={styles.lead}>
            The question didn&apos;t name a place I could match. Add a town, ZIP or &quot;lat,
            lon&quot;.
          </p>
        );
      }
      return (
        <div className={styles.answer}>
          <Banner tone="warning" icon="help" alert={false}>
            {`I'm not sure which place “${answer.plan.area.query}” means. Pick one and I'll ask again with it.`}
          </Banner>
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
                <Icon name="location_on" size="medium" />
                {`Use ${candidate.name}`}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "out_of_scope":
      return (
        <Banner tone="warning" icon="wrong_location" alert={false}>
          {`“${answer.plan.area.query}” is outside the area this CRM covers, so I didn't search. Try a place inside it.`}
        </Banner>
      );
    case "not_found":
      return (
        <Banner tone="warning" icon="location_off" alert={false}>
          {`I couldn't find “${placeOf(answer.plan)}” among the places I know. Check the spelling, or name a nearby town.`}
        </Banner>
      );
    case "rate_limited":
      return (
        <Banner tone="warning" icon="hourglass_top">
          {throttleText(secondsLeft, keptAnswer)}
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
          <div className={styles.actionRow}>
            <button type="button" className={styles.action} onClick={onRetry}>
              Try again
            </button>
          </div>
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

/** The question the answer is for, with the agent glyph (CrmAsk390: robot icon + the question). */
function AskedLine({ text }: { readonly text: string }): ReactElement {
  return (
    <p className={styles.asked}>
      <Icon name="smart_toy" size="medium" />
      <span>{text}</span>
    </p>
  );
}

/** "How I read this" plus the step count (CrmAsk390 "4 steps done") — both only for a real model
 *  plan; the steps line only when the server ran tools (`trace.toolSteps`). */
function PlanBlock({ answer }: { readonly answer: AgentAnswer }): ReactElement | null {
  if (!hasModelPlan(answer)) return null;
  const steps = answer.trace.toolSteps;
  return (
    <>
      {answer.plan.slotSources["area"] === "inherited" ? (
        <StatusPill status="info" icon="forum" text="Follow-up · area from your last question" />
      ) : null}
      <p className={styles.plan}>
        <b>How I read this:</b> {planSummary(answer.plan)}
      </p>
      {steps > 0 ? (
        <p className={styles.steps}>
          <Icon name="check_circle" size="medium" />
          {`${steps} step${steps === 1 ? "" : "s"} done`}
        </p>
      ) : null}
    </>
  );
}

/** Budget outcomes keep the last real answer on screen under their banner (CrmAskThrottled390:
 *  "The answer above, the map, Filters and your leads keep working"). */
const KEEPS_LAST: ReadonlySet<AgentAnswer["outcome"]> = new Set<AgentAnswer["outcome"]>([
  "rate_limited",
  "paused",
]);

interface Kept {
  readonly answer: AgentAnswer;
  readonly asked: string;
}

export function Component(): ReactElement {
  const [threadId] = useState(newThreadId);
  const [searchParams, setSearchParams] = useSearchParams();
  // Prefill only: asking costs model money, so the rep presses Ask (or Enter) themselves.
  const [question, setQuestion] = useState(() => prefillFrom(searchParams.get(ASK_QUESTION_PARAM)));
  const [asked, setAsked] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [kept, setKept] = useState<Kept | undefined>(undefined);
  const ask = useAskAgent();
  const runInfo = useRunInfo();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // On arrival with `?q=`: focus the box, then drop the param (replace, so Back does not return to
  // it and a reload does not prefill again).
  useEffect(() => {
    if (!searchParams.has(ASK_QUESTION_PARAM)) return;
    if (prefillFrom(searchParams.get(ASK_QUESTION_PARAM)) !== "") inputRef.current?.focus();
    const next = new URLSearchParams(searchParams);
    next.delete(ASK_QUESTION_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
    ask.mutate(
      { question: trimmed, threadId },
      {
        // A budget outcome keeps the last real answer on screen, so remember each real one.
        onSuccess: (answer) => {
          if (!KEEPS_LAST.has(answer.outcome)) setKept({ answer, asked: trimmed });
        },
      },
    );
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (ask.isPending || blocked) return;
    send(question);
  };

  /** Enter asks (as the single-line box did); Shift+Enter keeps a new line. */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const pickPlace = (name: string): void => {
    if (data === undefined) return;
    const next = clarifyQuestion(asked !== "" ? asked : question, data.plan, name);
    setQuestion(next);
    send(next);
  };

  const retry = (): void => send(asked !== "" ? asked : question);

  const announcement = ask.isPending ? "Working on your question…" : (heading ?? "");
  const showKept = !ask.isPending && data !== undefined && KEEPS_LAST.has(data.outcome);
  const keptAnswer = showKept && kept !== undefined;

  return (
    <section aria-label="Ask" data-route="ask" data-state={state} className={styles.page}>
      <div className={styles.composerPane}>
        <h2 className={styles.title}>
          <Icon name="auto_awesome" size="large" />
          Ask the agent
        </h2>
        <form className={styles.form} onSubmit={submit}>
          <label htmlFor="ask-question" className={styles.label}>
            Ask your question in plain English
          </label>
          <div className={styles.composer}>
            <textarea
              id="ask-question"
              ref={inputRef}
              className={styles.input}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="e.g. open roofing permits older than five years within five miles of Pflugerville"
              maxLength={500}
              rows={3}
              readOnly={ask.isPending}
              aria-busy={ask.isPending}
            />
            <div className={styles.composerFooter}>
              <span className={styles.composerNote}>{composerNote(runInfo.data?.runId)}</span>
              <button
                type="submit"
                className={styles.action}
                disabled={ask.isPending || blocked || question.trim() === ""}
              >
                <Icon name="auto_awesome" size="medium" />
                Ask
              </button>
            </div>
          </div>
        </form>
        <div className={styles.suggestions}>
          <span className={styles.label} id="ask-suggestions">
            Suggestions
          </span>
          <ul className={styles.suggestionList} aria-labelledby="ask-suggestions">
            {SUGGESTIONS.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  className={styles.suggestion}
                  disabled={ask.isPending}
                  onClick={() => setQuestion(text)}
                >
                  <Icon name="lightbulb" size="medium" />
                  <span className={styles.suggestionText}>{text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.resultPane}>
        <p role="status" aria-live="polite" className={styles.srOnly}>
          {announcement}
        </p>

        {ask.isPending ? (
          <div className={styles.result}>
            {asked === "" ? null : <AskedLine text={asked} />}
            <WorkingPanel seconds={seconds} />
          </div>
        ) : null}

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
            {data === undefined ? (
              <>
                {asked === "" ? null : <AskedLine text={asked} />}
                <p role="alert" className={styles.notice}>
                  The agent could not answer. Nothing was created. Try again.
                </p>
              </>
            ) : (
              <>
                {showKept ? null : asked === "" ? null : <AskedLine text={asked} />}
                <PlanBlock answer={data} />
                <AnswerBody
                  answer={data}
                  threadId={threadId}
                  secondsLeft={secondsLeft}
                  keptAnswer={keptAnswer}
                  onPickPlace={pickPlace}
                  onRetry={retry}
                />
              </>
            )}
          </article>
        )}

        {showKept && kept !== undefined ? (
          <section className={styles.result} aria-label="Your last answer">
            <AskedLine text={kept.asked} />
            <PlanBlock answer={kept.answer} />
            <AnswerBody
              answer={kept.answer}
              threadId={threadId}
              secondsLeft={undefined}
              keptAnswer={false}
              onPickPlace={pickPlace}
              onRetry={retry}
            />
          </section>
        ) : null}
      </div>
    </section>
  );
}
