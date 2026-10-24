// T042 (B-09/US2): the golden-query evaluation harness (checks.md §7.1/§7.2, quickstart.md step
// 3, agent-design.md alakazam §1). Calls `agent.ask`/`agent.confirmLead` over the DEPLOYED agent
// (RUNTIME_URL, never localhost -- constitution Article I "localhost is never evidence", the
// same guard `playwright.config.ts` already loads from `../e2e/lib/runtime-url.js`), 3 repeats
// paced 13s apart (8 asks per repeat incl. G7's seed, 24 total; stays under 5 asks/min).
//
// This test is expected to fail until Phase 4 (US1) is deployed and the Run 2 manifest is the
// promoted run (tasks.md T047) -- it cannot run in this development session at all: there is no
// deployed RUNTIME_URL yet, and no Cognito eval-user credentials to hand it. It is skip-guarded
// the same way `apps/api/test/leadIndex.manifestCid.test.ts` (T020) is: a real, assertion-bearing
// `describe` that only runs when every env var it needs is present, and an `it.todo` stub in the
// opposite case, so this file is never silently vacuous (an unconditional skip would hide a
// config mistake) and never breaks the local `pnpm test` CI gate (it has nothing to do with
// `@crm/api`'s own test run; `tests-agent` is its own workspace package, run only explicitly via
// `pnpm --filter tests-agent test`, same as `tests/e2e` is only ever run via the root `e2e`
// script).
//
// Required env, beyond RUNTIME_URL:
//  - CRM_COGNITO_USER_POOL_ID / CRM_COGNITO_USER_POOL_CLIENT_ID: the deployed pool (infra output,
//    `infra/lib/crm-web-stack.ts`'s VITE_COGNITO_* build-time pair, read here from plain env
//    since this harness is a Node script, not a Vite build). The app client only allows SRP
//    (`infra/lib/crm-ops-stack.ts`: `authFlows: { userSrp: true }`), so this harness signs in the
//    same way the browser does (`amazon-cognito-identity-js`, apps/web/src/auth/signIn.ts's own
//    dependency), not via a USER_PASSWORD_AUTH shortcut the app client doesn't permit.
//  - CRM_TEST_USERNAME (defaults to "admin@roofing-crm.test", the same seeded account every
//    Playwright spec in tests/e2e signs in as) / CRM_TEST_PASSWORD (never hard-coded --
//    constitution Article XII).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import { createApiClient, type ApiClient, type ApiFetch } from "@crm/api-client";
import { leadKey, requestIdentifierOf } from "@crm/domain";
import { assertHostedRuntimeUrl } from "../e2e/lib/runtime-url.js";
import {
  publishGoldenQueryPassRate,
  shouldPublishGoldenQueryPassRate,
} from "./publishGoldenQueryPassRate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------
// golden.json (T041)
// ---------------------------------------------------------------------------------------------

interface GoldenQuery {
  readonly id: string;
  readonly prompt: string;
  readonly mustDo: string;
  readonly expectedOutcome: string;
  readonly check: string;
  readonly inheritsAreaFrom?: string;
  readonly requiresRealPermitNumber?: boolean;
  /** G7: the query whose prompt seeds G7's own thread before G7's prompt is asked there. */
  readonly seedsThreadWith?: string;
  /** G7: the plan intent the server must read (ADR-06 `propose_leads`). */
  readonly expectedIntent?: string;
}

interface GoldenFile {
  readonly manifestCid: string;
  readonly queries: readonly GoldenQuery[];
  readonly grading: {
    readonly repeats: number;
    readonly pacingSeconds: number;
    readonly maxAsksPerMinute: number;
    readonly groundednessTargetPct: number;
    readonly correctnessRecallTargetPct: number;
    readonly latencyP95Ms: number;
    readonly latencyMaxMs: number;
  };
}

const golden = JSON.parse(readFileSync(join(__dirname, "golden.json"), "utf8")) as GoldenFile;

// ---------------------------------------------------------------------------------------------
// Environment guards -- see the file header for exactly which vars gate which block.
// ---------------------------------------------------------------------------------------------

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function hostedRuntimeUrl(): string | undefined {
  try {
    return assertHostedRuntimeUrl(process.env.RUNTIME_URL);
  } catch {
    return undefined;
  }
}

const RUNTIME_URL = hostedRuntimeUrl();
const COGNITO_USER_POOL_ID = process.env.CRM_COGNITO_USER_POOL_ID;
const COGNITO_USER_POOL_CLIENT_ID = process.env.CRM_COGNITO_USER_POOL_CLIENT_ID;
const CRM_TEST_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
const CRM_TEST_PASSWORD = process.env.CRM_TEST_PASSWORD;
// G5 needs a real, currently-open permit number from the deployed index; there is no way to
// discover one without first querying the deployed agent, so it is supplied, not derived, same
// spirit as the fixed TCAD request identifiers tests/e2e/B-07.spec.ts hard-codes from a real run.
const G5_REAL_PERMIT_NUMBER = process.env.CRM_GOLDEN_G5_PERMIT_NUMBER;

const canRun =
  RUNTIME_URL !== undefined &&
  nonEmpty(COGNITO_USER_POOL_ID) &&
  nonEmpty(COGNITO_USER_POOL_CLIENT_ID) &&
  nonEmpty(CRM_TEST_PASSWORD) &&
  nonEmpty(G5_REAL_PERMIT_NUMBER);

// ---------------------------------------------------------------------------------------------
// Auth (SRP, matching the app client's allowed flow) + API client
// ---------------------------------------------------------------------------------------------

function signIn(username: string, password: string): Promise<CognitoUserSession> {
  const pool = new CognitoUserPool({
    UserPoolId: COGNITO_USER_POOL_ID as string,
    ClientId: COGNITO_USER_POOL_CLIENT_ID as string,
  });
  const user = new CognitoUser({ Username: username, Pool: pool });
  const details = new AuthenticationDetails({ Username: username, Password: password });
  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

async function makeClient(): Promise<ApiClient> {
  const session = await signIn(CRM_TEST_USERNAME, CRM_TEST_PASSWORD as string);
  const idToken = session.getIdToken().getJwtToken();
  return createApiClient({
    url: `${RUNTIME_URL}/api/trpc`,
    headers: { Authorization: `Bearer ${idToken}` },
    fetch: fetch as ApiFetch,
  });
}

/** Sequential pacing: never more than `maxAsksPerMinute`, enforced by sleeping
 *  `pacingSeconds` between asks (agent-design.md alakazam §1: "paced 13s apart"). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------------------------
// Per-query checks (T042). AgentAnswer's real shape (packages/shared/src/agent/answer.ts), not
// checks.md's informal "property_cid" phrasing: citations carry `propertyCid`/`permitCid`,
// claims carry numeric `citationIds` that index into `citations`.
// ---------------------------------------------------------------------------------------------

interface AskResult {
  readonly answer: Awaited<ReturnType<ApiClient["agent"]["ask"]["mutate"]>>;
  readonly latencyMs: number;
}

async function timedAsk(client: ApiClient, question: string, threadId: string): Promise<AskResult> {
  const startedAt = Date.now();
  const answer = await client.agent.ask.mutate({ question, threadId });
  return { answer, latencyMs: Date.now() - startedAt };
}

function promptOf(id: string): string {
  const query = golden.queries.find((q) => q.id === id);
  if (query === undefined) throw new Error(`golden.json has no ${id}`);
  return query.prompt;
}

const G7 = golden.queries.find((q) => q.id === "G7");

function g7Prompt(): string {
  return promptOf("G7");
}

function g1Prompt(): string {
  return promptOf(G7?.seedsThreadWith ?? "G1");
}

/** The slice of `ApiClient` G7 uses, so the local test can drive the same function with a fake.
 *  `ApiClient` satisfies it structurally. */
interface G7Client {
  readonly agent: {
    readonly ask: {
      mutate(input: { question: string; threadId: string }): Promise<AskResult["answer"]>;
    };
    readonly confirmLead: {
      mutate(input: { threadId: string; tcadId: string }): Promise<{ createdFrom: string }>;
    };
  };
  readonly leads: {
    readonly list: {
      query(input: Record<string, never>): Promise<{
        leads: readonly { leadKey: string; createdFrom: string }[];
      }>;
    };
  };
}

/** G7 (checks.md §7.1 "Create a lead for the first result"), the real Ask flow in one thread:
 *  1. seed the thread with G1's question (gives the follow-up an area to inherit);
 *  2. ask G7's prompt there — the plan must be `propose_leads`, which records its proposals
 *     (threadStore.recordTurn) so confirmLead's NOT_PROPOSED check accepts them;
 *  3. confirm the first proposed tcadId (a separate, rep-style mutation — never the model), or,
 *     when an earlier repeat already made it a lead, accept the proposal's `alreadyLead`;
 *  4. the lead must appear in leads.list. */
async function runG7LeadRoundTrip(
  client: G7Client,
  threadId: string,
  pause: () => Promise<void>,
): Promise<{ tcadId: string; latencies: number[] }> {
  const latencies: number[] = [];
  const timed = async (question: string): Promise<AskResult["answer"]> => {
    const startedAt = Date.now();
    const answer = await client.agent.ask.mutate({ question, threadId });
    latencies.push(Date.now() - startedAt);
    return answer;
  };

  const seed = await timed(g1Prompt());
  expect(seed.outcome, "G7's seed question must answer").toBe("answered");
  await pause();

  const proposal = await timed(g7Prompt());
  expect(proposal.plan.intent).toBe(G7?.expectedIntent ?? "propose_leads");
  const first = proposal.proposals?.[0];
  expect(first, "G7 must propose at least one lead").toBeDefined();
  const tcadId = (first as NonNullable<typeof first>).tcadId;

  if (first?.alreadyLead !== true) {
    const lead = await client.agent.confirmLead.mutate({ threadId, tcadId });
    expect(lead.createdFrom).toBe("agent");
  }
  const list = await client.leads.list.query({});
  const found = list.leads.find((l) => requestIdentifierOf(l.leadKey) === tcadId);
  expect(found, "the G7 lead must appear in leads.list").toBeDefined();
  if (first?.alreadyLead !== true) expect(found?.createdFrom).toBe("agent");
  return { tcadId, latencies };
}

/** Groundedness (checks.md §7.2 step 2): every citation resolves against the pinned manifest and
 *  the claim it backs. Never a fabricated propertyCid/permitCid. */
function assertGroundedness(answer: AskResult["answer"]): void {
  for (const citation of answer.citations) {
    expect(citation.manifestCid).toBe(golden.manifestCid);
  }
  for (const claim of answer.claims) {
    for (const citationId of claim.citationIds) {
      expect(answer.citations.some((c) => c.id === citationId)).toBe(true);
    }
  }
}

/** Correctness (checks.md §7.2 step 3): re-run the equivalent search.properties/search.permits
 *  call with the answer's own stated center/thresholds (plan.area.resolved / plan.filters --
 *  never a second, independently-guessed center), and check the cited CIDs are a subset of that
 *  real result set at >= the configured recall. */
async function assertCorrectness(
  client: ApiClient,
  answer: AskResult["answer"],
  kind: "properties" | "permits",
): Promise<void> {
  const resolved = answer.plan.area.resolved;
  if (resolved === undefined) return; // ambiguous/out-of-scope answers have nothing to re-check
  const center = { lat: resolved.lat, lng: resolved.lon };
  const citedCids =
    kind === "properties"
      ? answer.citations
          .filter((c) => c.propertyCid !== undefined)
          .map((c) => c.propertyCid as string)
      : answer.citations.filter((c) => c.permitCid !== undefined).map((c) => c.permitCid as string);
  if (citedCids.length === 0) return; // nothing cited to check recall over

  let realCids: string[];
  if (kind === "properties") {
    const real = await client.search.properties.query({
      center,
      radiusMi: answer.plan.area.radiusMi,
      ...(answer.plan.filters.roofAgeMinYears === undefined
        ? {}
        : { roofAgeMinYears: answer.plan.filters.roofAgeMinYears }),
    });
    realCids = real.properties.map((p) => p.propertyCid);
  } else {
    const real = await client.search.permits.query({
      center,
      radiusMi: answer.plan.area.radiusMi,
      sort: "openDays",
    });
    realCids = real.permits.map((p) => p.permitCid);
  }

  const matched = citedCids.filter((cid) => realCids.includes(cid));
  const recallPct = (matched.length / citedCids.length) * 100;
  expect(recallPct).toBeGreaterThanOrEqual(golden.grading.correctnessRecallTargetPct);
}

/** Honesty (checks.md §7.2 step 4): the stated center/thresholds and missing-data flags are
 *  present in the structured plan/missing fields -- never only "trust me" free text, since the
 *  UI/golden harness both read the structured answer, not model prose. */
function assertHonesty(answer: AskResult["answer"]): void {
  expect(answer.plan.area.radiusMi).toBeGreaterThan(0);
  // Every declared-missing field carries a reason, never a silent drop (constitution XI).
  for (const missing of answer.missing) {
    expect(missing.reason.length).toBeGreaterThan(0);
  }
}

async function assertG6ZeroFabrication(answer: AskResult["answer"]): Promise<void> {
  expect(["out_of_scope", "empty_in_scope", "not_found"]).toContain(answer.outcome);
  expect(answer.claims).toHaveLength(0);
  expect(answer.citations).toHaveLength(0);
  expect(answer.counts.matched).toBe(0);
}

interface RepeatTally {
  readonly passedCount: number;
  readonly totalCount: number;
}

/** T054: per-query pass/fail tally for this repeat, so the caller can accumulate a
 *  `GoldenQueryPassRate` across every repeat in the run -- a single query's transient failure
 *  (one timeout, one bad golden-query assertion) moves the rate, it does not zero the whole run's
 *  reported rate the way an uncaught `expect()` throw would. The *test's* own pass/fail semantics
 *  (CI gating) are unchanged below: this function still rethrows the first failure after tallying
 *  it, exactly as it did before T054. */
async function runOneRepeat(client: ApiClient, repeatIndex: number): Promise<RepeatTally> {
  const threadId = `golden-${Date.now()}-${repeatIndex}`;
  const latencies: number[] = [];
  let passedCount = 0;
  let totalCount = 0;
  let firstFailure: unknown;

  for (const query of golden.queries) {
    if (query.id === "G5" && !nonEmpty(G5_REAL_PERMIT_NUMBER)) continue;
    totalCount += 1;

    const prompt =
      query.id === "G5"
        ? query.prompt.replace("{real permit number}", G5_REAL_PERMIT_NUMBER as string)
        : query.prompt;

    try {
      if (query.id === "G7") {
        // G7 runs in its own thread (`-g7`): this thread's last plan is G6's out-of-scope ZIP,
        // which "the first result" must not inherit. confirmLead stays a separate,
        // non-model-invoked mutation (constitution P0, contracts/agent-api.md).
        const g7 = await runG7LeadRoundTrip(client, `${threadId}-g7`, () =>
          sleep(golden.grading.pacingSeconds * 1000),
        );
        latencies.push(...g7.latencies);
        passedCount += 1;
      } else {
        const { answer, latencyMs } = await timedAsk(client, prompt, threadId);
        latencies.push(latencyMs);

        if (query.id === "G6") {
          await assertG6ZeroFabrication(answer);
        } else {
          expect(answer.outcome).toBe("answered");
          assertGroundedness(answer);
          assertHonesty(answer);
          await assertCorrectness(
            client,
            answer,
            query.prompt.toLowerCase().includes("permit") ? "permits" : "properties",
          );
        }

        passedCount += 1;
      }
    } catch (error) {
      firstFailure ??= error;
    }

    await sleep(golden.grading.pacingSeconds * 1000);
  }

  // Latency (checks.md §7.1/quickstart.md step 3): p95 < 20s, max < 23.5s, per repeat.
  if (latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    try {
      expect(sorted[p95Index]).toBeLessThan(golden.grading.latencyP95Ms);
      expect(Math.max(...sorted)).toBeLessThan(golden.grading.latencyMaxMs);
    } catch (error) {
      firstFailure ??= error;
    }
  }

  if (firstFailure !== undefined) throw firstFailure;
  return { passedCount, totalCount };
}

// T054 (+ B-09 review fix): every real run ends by publishing its GoldenQueryPassRate, so the
// RoofingCrm dashboard trends real runs. Still skip-guarded: only when this harness can run for
// real (`canRun`) and AWS credentials are present (a CI job without CloudWatch access still gates
// the merge; it just adds no datapoint). `CRM_PUBLISH_GOLDEN_METRIC=false` opts out.
const PUBLISH_GOLDEN_QUERY_PASS_RATE = shouldPublishGoldenQueryPassRate({
  harnessRan: canRun,
  env: process.env,
});

describe.skipIf(!canRun)("golden queries G1-G7 against the deployed agent (RUNTIME_URL)", () => {
  it("runs GOLDEN_REPEATS repeats, each paced under 5 asks/min, grounded/correct/honest", async () => {
    const client = await makeClient();
    let passedCount = 0;
    let totalCount = 0;
    let firstFailure: unknown;
    try {
      for (let repeatIndex = 0; repeatIndex < golden.grading.repeats; repeatIndex += 1) {
        try {
          const tally = await runOneRepeat(client, repeatIndex);
          passedCount += tally.passedCount;
          totalCount += tally.totalCount;
        } catch (error) {
          // runOneRepeat already tallied its own queries before rethrowing its first failure;
          // this file has no per-query count on that path, so count the whole repeat's worth
          // of queries as attempted-and-failed rather than silently omitting it from the rate.
          totalCount += golden.queries.length;
          firstFailure ??= error;
        }
      }
    } finally {
      if (PUBLISH_GOLDEN_QUERY_PASS_RATE && totalCount > 0) {
        await publishGoldenQueryPassRate({ passedCount, totalCount });
      }
    }
    if (firstFailure !== undefined) throw firstFailure;
  });
});

describe.skipIf(canRun)(
  "golden queries G1-G7 against the deployed agent (local run, no deployed env)",
  () => {
    it.todo(
      "skipped locally -- set RUNTIME_URL (hosted, never localhost), CRM_COGNITO_USER_POOL_ID, " +
        "CRM_COGNITO_USER_POOL_CLIENT_ID, CRM_TEST_PASSWORD and CRM_GOLDEN_G5_PERMIT_NUMBER to " +
        "the deployed stack's values to run this for real (quickstart.md step 3 / tasks.md T047), " +
        "once Phase 4 (US1) is deployed and the Run 2 manifest is promoted",
    );
  },
);

// ---------------------------------------------------------------------------------------------
// G7's round trip against a fake client (always runs): the flow the deployed run follows. CR
// finding 6b: `agent.confirmLead` accepts only a tcadId the agent *proposed* in that thread, so
// G7 seeds its own thread with G1's question, asks G7's prompt there (plan intent
// `propose_leads`, ADR-06), and confirms the first proposed tcadId — never a tcadId lifted from
// G1's citations, which `find_properties` never records as proposed.
// ---------------------------------------------------------------------------------------------

type FakeAnswer = AskResult["answer"];

function fakeAnswer(overrides: Partial<FakeAnswer>): FakeAnswer {
  return {
    outcome: "answered",
    claims: [],
    citations: [],
    plan: {
      intent: "find_properties",
      area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
      filters: {},
      slotSources: {},
      unsupported: [],
    },
    resultSetId: "rs",
    counts: {
      matched: 1,
      shown: 1,
      excludedNoCoordinates: 0,
      excludedNoRoofDate: 0,
      truncated: false,
    },
    missing: [],
    trace: {
      traceId: "t",
      modelId: "m",
      promptVersion: "p",
      rankVersion: "r",
      toolSteps: 1,
      modelCalls: 2,
    },
    ...overrides,
  } as FakeAnswer;
}

function fakeClient(options: {
  alreadyLead: boolean;
  intent?: "propose_leads" | "find_properties";
}) {
  const proposed = new Set<string>();
  const leads: { leadKey: string; createdFrom: string }[] = options.alreadyLead
    ? [{ leadKey: leadKey("48453", "0201885122"), createdFrom: "agent" }]
    : [];
  const asks: { question: string; threadId: string }[] = [];
  const confirms: { threadId: string; tcadId: string }[] = [];
  const client: G7Client = {
    agent: {
      ask: {
        mutate: async (input) => {
          asks.push(input);
          if (asks.length === 1) return fakeAnswer({});
          const intent = options.intent ?? "propose_leads";
          if (intent === "propose_leads") proposed.add(`${input.threadId}|0201885122`);
          return fakeAnswer({
            plan: { ...fakeAnswer({}).plan, intent, slotSources: { area: "inherited" } },
            ...(intent === "propose_leads"
              ? {
                  proposals: [
                    { tcadId: "0201885122", alreadyLead: options.alreadyLead },
                    { tcadId: "0201885123", alreadyLead: false },
                  ],
                }
              : {}),
          });
        },
      },
      confirmLead: {
        mutate: async (input) => {
          confirms.push(input);
          if (!proposed.has(`${input.threadId}|${input.tcadId}`)) throw new Error("NOT_PROPOSED");
          leads.push({ leadKey: leadKey("48453", input.tcadId), createdFrom: "agent" });
          return { createdFrom: "agent" };
        },
      },
    },
    leads: { list: { query: async () => ({ leads }) } },
  };
  return { client, asks, confirms };
}

describe("G7 lead round trip (local, fake client)", () => {
  const noPause = async (): Promise<void> => {};

  it("seeds one thread with G1, asks G7 there, then confirms the first proposed tcadId", async () => {
    const { client, asks, confirms } = fakeClient({ alreadyLead: false });
    const result = await runG7LeadRoundTrip(client, "thread-g7", noPause);
    expect(asks.map((a) => a.question)).toEqual([g1Prompt(), g7Prompt()]);
    expect(new Set(asks.map((a) => a.threadId))).toEqual(new Set(["thread-g7"]));
    expect(confirms).toEqual([{ threadId: "thread-g7", tcadId: "0201885122" }]);
    expect(result.tcadId).toBe("0201885122");
    expect(result.latencies).toHaveLength(2);
  });

  it("an already-proposed lead is checked in leads.list, not created twice", async () => {
    const { client, confirms } = fakeClient({ alreadyLead: true });
    const result = await runG7LeadRoundTrip(client, "thread-g7", noPause);
    expect(confirms).toHaveLength(0);
    expect(result.tcadId).toBe("0201885122");
  });

  it("fails when G7's plan is not propose_leads (nothing was proposed)", async () => {
    const { client } = fakeClient({ alreadyLead: false, intent: "find_properties" });
    await expect(runG7LeadRoundTrip(client, "thread-g7", noPause)).rejects.toThrow();
  });
});
