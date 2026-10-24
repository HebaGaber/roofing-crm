// T035/T036 (B-09, Phase 4/US1): the `agent` tRPC router (contracts/agent-api.md). `ask` runs the
// budget check, the scope/confidence short-circuit, the tool loop (`runAgent.ts`), and the
// citation verifier (`composeAnswer.ts`); `confirmLead` is a plain, non-model-invoked mutation
// that calls the exact same `requireLeadService(ctx).create(...)` path `leads.create` already
// uses — per the confirm-flow-bypass guard (T029), nothing in `services/agent/tools.ts` may ever
// reach that call; only this one handler does.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gazetteer } from "@crm/oracle-views";
import { createObservability, METRIC_NAMES } from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import type { AgentAnswer } from "@crm/shared";
import {
  publicProcedure,
  requireLeadIndex,
  requireLeadService,
  requireUserId,
  router,
} from "../trpc.js";
import { IndexNotReadyError, type LeadIndex } from "../adapters/duckDbParquet.js";
import type { LeadRepo } from "../adapters/leadRepo.js";
import { createAgentTools } from "../services/agent/tools.js";
import { createPlaceResolver } from "../services/agent/placeResolver.js";
import { getModel } from "../agent/getModel.js";
import { runAgent } from "../agent/runAgent.js";
import { tryUsageGuard } from "../agent/usageGuard.js";
import { RateLimitedError, OverBudgetError } from "../agentErrors.js";
import { checkScope, composeAnswer, emptyPlan, parsePlanDraftText } from "../agent/composeAnswer.js";

const obs = createObservability("crm-api");

/** AC-7/FR-007 (data-model.md "New this round: data-publication reference"): the Run-1
 *  full-county manifest CID this story pins `agent.confirmLead`'s `sourceManifestCid` to. */
const PINNED_MANIFEST_CID = "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu";

/** A flat per-ask spend estimate, reserved before any model call (contracts/agent-api.md step 1).
 *  Refined to real measured Bedrock token costs in US2 (T045's prompt-caching work); until then
 *  this is deliberately conservative-cheap so the $3/day cap is never the first thing a demo
 *  hits. */
const ESTIMATED_COST_CENTS_PER_ASK = 1;

const AskInput = z.object({
  question: z.string().trim().min(1).max(500),
  threadId: z.string().min(1),
});

const ConfirmLeadInput = z.object({
  threadId: z.string().min(1),
  tcadId: z.string().min(1),
});

/** Same mapping as routers/search.ts's `mapIndexNotReady`. */
function mapIndexNotReady(error: unknown): never {
  if (error instanceof IndexNotReadyError) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error.message, cause: error });
  }
  throw error;
}

function causeWithCode(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** contracts/agent-api.md step 1: budget check first, before any model call. A deploy that
 *  hasn't wired `CRM_AGENT_USAGE_TABLE_NAME` yet (the same "known infra gap, degrade not crash"
 *  rule `tryLeadIndex`/`tryLeadService` already follow) skips enforcement rather than failing
 *  every ask. */
async function checkBudget(userId: string): Promise<void> {
  const guard = tryUsageGuard();
  if (guard === undefined) return;
  try {
    await guard.rateLimiter.check(userId);
    await guard.spendCap.reserve(userId, ESTIMATED_COST_CENTS_PER_ASK);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
        cause: causeWithCode("RATE_LIMITED", error.message),
      });
    }
    if (error instanceof OverBudgetError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
        cause: causeWithCode("OVER_BUDGET", error.message),
      });
    }
    throw error;
  }
}

/** `apps/api/src/services/agent/tools.ts`'s `proposeLeads` only ever reads (a `LeadRepo.get` dup
 *  check) — this stub is used only when a request's context hasn't wired a real `LeadRepo` (a
 *  test exercising `agent.ask` without ever calling `proposeLeads`), and itself still never
 *  writes; it just can't answer a dup-check it was never given a backing store for. */
function unavailableLeadRepo(): LeadRepo {
  const unavailable = (): never => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LeadRepo not wired into this Lambda's tRPC context",
    });
  };
  return {
    create: unavailable,
    updateStatus: unavailable,
    addNote: unavailable,
    get: unavailable,
  } as unknown as LeadRepo;
}

const SYSTEM_PROMPT =
  "You are the Roofing CRM's agent. Answer only from tool results; never invent a property, " +
  "permit, address, contractor name or rating. If the question is outside Travis County, " +
  "or you cannot place it with confidence, answer in plain text as a small JSON object " +
  '{"intent","area":{"kind","query"},"filters"} describing how you read the question, and call ' +
  "no tool. Otherwise use resolvePlace/searchProperties/searchPermits/getProperty/getCoverage/" +
  "proposeLeads as needed, then finish with a JSON object " +
  '{"claims":[{"text","citationIds":[...]}],"citations":[{"id","propertyCid"|"permitCid"}]} ' +
  "citing only rows a tool actually returned this turn.";

function emptyAnswer(
  outcome: AgentAnswer["outcome"],
  plan: AgentAnswer["plan"],
  traceId: string,
  modelCalls: number,
): AgentAnswer {
  return {
    outcome,
    claims: [],
    citations: [],
    plan,
    resultSetId: traceId,
    counts: { matched: 0, shown: 0, excludedNoCoordinates: 0, excludedNoRoofDate: 0, truncated: false },
    missing: [],
    trace: {
      traceId,
      modelId: "n/a",
      promptVersion: "2026-10-23",
      rankVersion: "2026-10-23",
      toolSteps: 0,
      modelCalls,
    },
  };
}

/** Typed by shape, not by `TrpcContext` itself — same reason as `requireLeadIndex`/
 *  `requireLeadService`: tRPC's resolved context for a `.mutation(({ctx}) => ...)` callback
 *  widens every optional property to an explicit `| undefined` union, which
 *  `exactOptionalPropertyTypes` treats as distinct from `TrpcContext`'s own optional
 *  declaration. */
interface AskContext {
  readonly requestId: string;
  readonly userId: string | undefined;
  readonly leadIndex: LeadIndex | undefined;
  readonly leadRepo: LeadRepo | undefined;
  readonly model: import("ai").LanguageModel | undefined;
}

async function ask(input: z.infer<typeof AskInput>, ctx: AskContext): Promise<AgentAnswer> {
  const userId = requireUserId(ctx);
  await checkBudget(userId); // step 1: before any model call

  const leadIndex: LeadIndex = requireLeadIndex(ctx);
  const leadRepo = ctx.leadRepo ?? unavailableLeadRepo();
  const placeResolver = createPlaceResolver();
  const model = ctx.model ?? getModel();
  const tools = createAgentTools({ leadIndex, leadRepo, placeResolver });

  const { manifestCid } = await leadIndex.indexInfo().catch(mapIndexNotReady);

  const run = await runAgent({
    model,
    tools,
    system: SYSTEM_PROMPT,
    prompt: input.question,
  });

  if (run.outcome === "timed_out") {
    return emptyAnswer("timed_out", emptyPlan(input.question), ctx.requestId, 0);
  }

  const { result } = run;
  const calledAnyTool = result.steps.some((step) => step.toolResults.length > 0);

  if (!calledAnyTool) {
    // Step 3/4 (contracts/agent-api.md): the model answered in its first step without calling a
    // tool. Treat that text as its plan draft and run the scope/confidence check — out of scope,
    // not found or low-confidence short-circuits here with no further model call.
    const area = parsePlanDraftText(result.text);
    if (area === undefined) {
      return emptyAnswer("needs_clarification", emptyPlan(input.question), ctx.requestId, result.steps.length);
    }
    const scope = await checkScope(area, { placeResolver });
    const plan = emptyPlan(area.query);
    if (scope.status !== "in_scope") {
      return emptyAnswer(scope.status, plan, ctx.requestId, result.steps.length);
    }
    // In scope but the model still never called a tool this turn (no retrieval happened) — safest
    // honest outcome is to ask for clarification rather than answer with nothing to cite.
    return emptyAnswer("needs_clarification", plan, ctx.requestId, result.steps.length);
  }

  const modelId = typeof model === "string" ? model : model.modelId;
  return composeAnswer({
    result,
    leadIndex,
    manifestCid,
    plan: emptyPlan(input.question),
    traceId: ctx.requestId,
    modelId,
  });
}

export const agentRouter = router({
  ask: publicProcedure.input(AskInput).mutation(async ({ input, ctx }) => {
    const subsegment = obs.tracer.getSegment()?.addNewSubsegment("## agent.ask");
    try {
      const answer = await ask(input, ctx);
      obs.logger.info("agent.ask ok", { requestId: ctx.requestId, outcome: answer.outcome });
      obs.metrics.addMetric(METRIC_NAMES.AgentAsksTotal, MetricUnit.Count, 1);
      return answer;
    } catch (error) {
      const code = error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR";
      obs.logger[code === "INTERNAL_SERVER_ERROR" ? "error" : "info"]("agent.ask failed", {
        requestId: ctx.requestId,
        code,
      });
      throw error;
    } finally {
      subsegment?.close();
      obs.metrics.publishStoredMetrics();
    }
  }),

  confirmLead: publicProcedure.input(ConfirmLeadInput).mutation(async ({ input, ctx }) => {
    const leadIndex = requireLeadIndex(ctx);
    const detail = await leadIndex.searchProperties({ limit: 1_000_000 }).catch(mapIndexNotReady);
    const property = detail.find((row) => row.requestIdentifier === input.tcadId);
    if (property === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: `No property for tcadId ${input.tcadId}` });
    }
    return requireLeadService(ctx).create(
      {
        fips: gazetteer.TRAVIS_FIPS,
        requestIdentifier: input.tcadId,
        address: `TCAD ${input.tcadId}`,
        lat: property.latitude ?? 0,
        lon: property.longitude ?? 0,
        signals: {
          roofAgeYears: property.roofAgeYears ?? undefined,
          roofAgeBasis: property.roofAgeBasis,
        },
        sourceManifestCid: PINNED_MANIFEST_CID,
        createdFrom: "agent",
      },
      requireUserId(ctx),
    );
  }),
});

export type AgentRouter = typeof agentRouter;
