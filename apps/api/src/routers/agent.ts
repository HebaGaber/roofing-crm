// T035/T036 (B-09, Phase 4/US1), reshaped in the 009-agent-hardening architecture fix: the
// `agent` tRPC router (contracts/agent-api.md). `ask` runs the budget check (step 1, before any
// model call), then delegates the whole two-call, code-driven turn (plan -> scope gate ->
// dispatch -> compose -> verify) to `agent/composeAnswer.ts`'s `runAsk`; `confirmLead` is a
// plain, non-model-invoked mutation that calls the exact same `requireLeadService(ctx).create(...)`
// path `leads.create` already uses — per the confirm-flow-bypass guard (T029), nothing in
// `services/agent/tools.ts` may ever reach that call; only this one handler does.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gazetteer } from "@crm/oracle-views";
import { createObservability, METRIC_NAMES } from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import type { AgentAnswer } from "@crm/shared";
import {
  causeWithCode,
  mapIndexNotReady,
  publicProcedure,
  requireLeadIndex,
  requireLeadService,
  requireUserId,
  router,
} from "../trpc.js";
import type { LeadIndex } from "../adapters/duckDbParquet.js";
import type { LeadRepo } from "../adapters/leadRepo.js";
import { propertyByTcadId } from "../services/agent/tools.js";
import { createPlaceResolver } from "../services/agent/placeResolver.js";
import { getModel } from "../agent/getModel.js";
import { tryUsageGuard } from "../agent/usageGuard.js";
import { RateLimitedError, OverBudgetError } from "../agentErrors.js";
import { runAsk } from "../agent/composeAnswer.js";

const obs = createObservability("crm-api");

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

  try {
    return await runAsk({
      model,
      leadIndex,
      leadRepo,
      placeResolver,
      question: input.question,
      traceId: ctx.requestId,
      obs,
    });
  } catch (error) {
    // `leadIndex.indexInfo()` (called inside `runAsk`'s dispatch step) keeps its own typed-error
    // mapping (`mapIndexNotReady`) — same `SERVICE_UNAVAILABLE` pattern as `search.ts`/
    // `property.ts` — applied here since `runAsk` itself has no reason to know about tRPC error
    // shapes.
    return mapIndexNotReady(error);
  }
}

export const agentRouter = router({
  ask: publicProcedure.input(AskInput).mutation(async ({ input, ctx }) => {
    const subsegment = obs.tracer.getSegment()?.addNewSubsegment("## agent.ask");
    const startedAtMs = Date.now();
    try {
      const answer = await ask(input, ctx);
      // T045 (ADR §6.1: "Log cache read/write tokens"): logged here (not just carried in
      // `trace`) so a deploy without any trace-consuming UI still surfaces cache-hit behaviour in
      // CloudWatch Logs.
      obs.logger.info("agent.ask ok", {
        requestId: ctx.requestId,
        outcome: answer.outcome,
        cacheStrategy: answer.trace.cacheStrategy,
        cacheReadTokens: answer.trace.cacheReadTokens,
        cacheWriteTokens: answer.trace.cacheWriteTokens,
      });
      // `outcome` dimension (contracts/observability.md): same dimension value on both metrics
      // below, cleared again on the publish in `finally` so it never leaks into another request's
      // flush (Powertools `publishStoredMetrics()` clears dimensions as well as metrics).
      obs.metrics.addDimension("outcome", answer.outcome);
      obs.metrics.addMetric(METRIC_NAMES.AgentAsksTotal, MetricUnit.Count, 1);
      obs.metrics.addMetric(
        METRIC_NAMES.AgentAnswerLatencyMs,
        MetricUnit.Milliseconds,
        Date.now() - startedAtMs,
      );
      obs.metrics.addMetric(
        METRIC_NAMES.AgentModelCallsTotal,
        MetricUnit.Count,
        answer.trace.modelCalls,
      );
      return answer;
    } catch (error) {
      const code = error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR";
      obs.logger[code === "INTERNAL_SERVER_ERROR" ? "error" : "info"]("agent.ask failed", {
        requestId: ctx.requestId,
        code,
      });
      obs.metrics.addDimension("outcome", "error");
      obs.metrics.addMetric(METRIC_NAMES.AgentAsksTotal, MetricUnit.Count, 1);
      obs.metrics.addMetric(
        METRIC_NAMES.AgentAnswerLatencyMs,
        MetricUnit.Milliseconds,
        Date.now() - startedAtMs,
      );
      throw error;
    } finally {
      subsegment?.close();
      obs.metrics.publishStoredMetrics();
    }
  }),

  confirmLead: publicProcedure.input(ConfirmLeadInput).mutation(async ({ input, ctx }) => {
    const leadIndex = requireLeadIndex(ctx);
    const property = await propertyByTcadId(leadIndex, input.tcadId).catch(mapIndexNotReady);
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
        // Constitution B2 / AC-7: the lead records the manifest this property row actually came
        // from — the row's own provenance, exactly as `leads.create` on the map path does
        // (apps/web LeadCreateAction sends `property.sourceManifestCid`). Never a pinned constant:
        // switching Task A runs is a `DATA_MANIFEST_CID` config change + deploy, not a code edit.
        sourceManifestCid: property.sourceManifestCid,
        createdFrom: "agent",
      },
      requireUserId(ctx),
    );
  }),
});

export type AgentRouter = typeof agentRouter;
